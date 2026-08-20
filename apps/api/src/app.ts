import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { loadConfig } from "./config";
import { authPlugin } from "./plugins/auth";
import { errorPlugin } from "./plugins/error";
import { registerRoutes } from "./routes";

export async function buildApp() {
  const config = loadConfig();
  const app = Fastify({
    logger: config.env !== "test" ? true : false,
    trustProxy: true,
    bodyLimit: 25 * 1024 * 1024, // 25MB for document uploads
  });

  await app.register(cors, {
    origin: config.webUrl,
    credentials: true,
  });
  await app.register(errorPlugin);
  await app.register(authPlugin);
  await registerRoutes(app);

  app.get("/health", async () => ({ ok: true, ts: Date.now() }));

  return app;
}