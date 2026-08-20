export interface AppConfig {
  env: string;
  port: number;
  host: string;
  apiUrl: string;
  webUrl: string;
  jwtSecret: string;
  authCookie: string;
  sessionTtlSeconds: number;
  storageDriver: "local" | "s3";
  storageLocalDir: string;
  s3: {
    endpoint?: string;
    accessKey?: string;
    secretKey?: string;
    bucket?: string;
    forcePathStyle: boolean;
    region?: string;
  };
  docSignedUrlTtlSeconds: number;
  databaseUrl: string;
  dbEncryptionKey: string;
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

export function loadConfig(): AppConfig {
  const storageDriver = (process.env.STORAGE_DRIVER ?? "local") as AppConfig["storageDriver"];

  return {
    env: process.env.NODE_ENV ?? "development",
    port: int("API_PORT", 8080),
    host: process.env.API_HOST ?? "0.0.0.0",
    apiUrl: process.env.API_URL ?? `http://localhost:${int("API_PORT", 8080)}`,
    webUrl: process.env.WEB_URL ?? "http://localhost:3000",
    jwtSecret: required("JWT_SECRET"),
    authCookie: process.env.AUTH_COOKIE ?? "wishubest_session",
    sessionTtlSeconds: int("SESSION_TTL_SECONDS", 7 * 24 * 3600),
    storageDriver,
    storageLocalDir: process.env.STORAGE_LOCAL_DIR ?? ".storage/private-documents",
    s3: {
      endpoint: process.env.S3_ENDPOINT,
      accessKey: process.env.S3_ACCESS_KEY,
      secretKey: process.env.S3_SECRET_KEY,
      bucket: process.env.S3_BUCKET ?? "private-documents",
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      region: process.env.S3_REGION ?? "us-east-1",
    },
    docSignedUrlTtlSeconds: int("DOC_SIGNED_URL_TTL_SECONDS", 300),
    databaseUrl: process.env.DATABASE_URL ?? "",
    dbEncryptionKey: process.env.DB_ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? "dev-only-insecure-key",
  };
}