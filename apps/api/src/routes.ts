import { FastifyInstance } from "fastify";
import { registerAuthRoutes } from "./modules/auth/routes";

export async function registerRoutes(app: FastifyInstance) {
  await registerAuthRoutes(app);
}