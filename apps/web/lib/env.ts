import { readFileSync } from "fs";

// Minimal env loader for the Next.js server (Next loads .env itself, this
// just makes the shared tokens available to TS at build time).
export function getEnv(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

export const API_URL = getEnv("API_URL", "http://localhost:8080");
export const WEB_URL = getEnv("WEB_URL", "http://localhost:3000");

export function readVersion(): string {
  try {
    return JSON.parse(readFileSync("../../package.json", "utf8")).version as string;
  } catch {
    return "0.0.0";
  }
}