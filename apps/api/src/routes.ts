import { FastifyInstance } from "fastify";
import { registerAuthRoutes } from "./modules/auth/routes";
import { registerAdminRoutes } from "./modules/admin/routes";

export async function registerRoutes(app: FastifyInstance) {
  await registerAuthRoutes(app);
  await registerAdminRoutes(app);
}