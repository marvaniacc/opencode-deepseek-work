import { createReadStream } from "fs";
import { StorageDriver } from "./storage";

interface S3Config {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  forcePathStyle: boolean;
  region?: string;
}

// S3-compatible storage (MinIO) driver.
// The AWS SDK is only imported when this driver is actually selected.
export class S3StorageDriver implements StorageDriver {
  private client: any;

  constructor(private readonly cfg: S3Config) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
    this.client = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region ?? "us-east-1",
      credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
      forcePathStyle: cfg.forcePathStyle,
    });
    this.PutObjectCommand = PutObjectCommand;
    this.GetObjectCommand = GetObjectCommand;
    this.DeleteObjectCommand = DeleteObjectCommand;
  }

  private PutObjectCommand: any;
  private GetObjectCommand: any;
  private DeleteObjectCommand: any;

  async put(key: string, data: Buffer, _mimeType: string): Promise<void> {
    await this.client.send(
      new this.PutObjectCommand({ Bucket: this.cfg.bucket, Key: key, Body: data })
    );
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new this.GetObjectCommand({ Bucket: this.cfg.bucket, Key: key })
    );
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  createReadStream(_key: string): any {
    throw new Error("S3 driver uses get(); createReadStream is not supported");
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new this.DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: key })
    );
  }
}