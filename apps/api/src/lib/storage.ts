import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { createReadStream } from "fs";
import crypto from "crypto";
import { AppConfig } from "../config";

export interface StorageDriver {
  put(key: string, data: Buffer, mimeType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  createReadStream(key: string): fs.ReadStream;
  delete(key: string): Promise<void>;
}

export class LocalStorageDriver implements StorageDriver {
  constructor(private readonly baseDir: string) {}

  private resolve(key: string): string {
    const safe = key.replace(/[^a-zA-Z0-9._/-]/g, "_");
    const full = path.resolve(this.baseDir, safe);
    if (!full.startsWith(path.resolve(this.baseDir))) {
      throw new Error("Invalid storage key");
    }
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const full = this.resolve(key);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    await fsp.writeFile(full, data);
  }

  async get(key: string): Promise<Buffer> {
    return fsp.readFile(this.resolve(key));
  }

  createReadStream(key: string): fs.ReadStream {
    return createReadStream(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await fsp.rm(this.resolve(key), { force: true });
  }
}

export function createStorageDriver(config: AppConfig): StorageDriver {
  if (config.storageDriver === "s3") {
    // Lazy import so the S3 SDK is only loaded when needed.
    const { S3StorageDriver } = require("./s3Driver") as typeof import("./s3Driver");
    return new S3StorageDriver({
      endpoint: config.s3.endpoint!,
      accessKey: config.s3.accessKey!,
      secretKey: config.s3.secretKey!,
      bucket: config.s3.bucket!,
      forcePathStyle: config.s3.forcePathStyle,
      region: config.s3.region,
    });
  }
  return new LocalStorageDriver(config.storageLocalDir);
}

// HMAC-signed download tickets. A ticket authorizes downloading one file for a
// short window without revealing a long-lived URL. Both the local and S3
// drivers stream through the API, so the SAME ticket scheme is used everywhere.
export function createDownloadTicket(
  secret: string,
  fileKey: string,
  ttlSeconds: number
): { token: string; expiresAt: number } {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = JSON.stringify({ fileKey, exp: expiresAt });
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const token = Buffer.from(JSON.stringify({ p: payload, s: sig })).toString("base64url");
  return { token, expiresAt };
}

export function verifyDownloadTicket(
  secret: string,
  token: string
): { fileKey: string; expiresAt: number } | null {
  try {
    const parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    const payload: string = parsed.p;
    const sig: string = parsed.s;
    if (typeof payload !== "string" || typeof sig !== "string") return null;
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(payload) as { fileKey: string; exp: number };
    if (!data.fileKey || typeof data.exp !== "number") return null;
    if (data.exp < Math.floor(Date.now() / 1000)) return null;
    return { fileKey: data.fileKey, expiresAt: data.exp };
  } catch {
    return null;
  }
}