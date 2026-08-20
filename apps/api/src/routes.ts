import { FastifyInstance } from "fastify";
import { registerAuthRoutes } from "./modules/auth/routes";
import { registerAdminRoutes } from "./modules/admin/routes";
import { registerProviderRoutes } from "./modules/provider/routes";
import { registerMarketplaceRoutes } from "./modules/marketplace/routes";
import { registerBookingRoutes } from "./modules/booking/routes";
import { registerPaymentRoutes } from "./modules/payment/routes";
import { registerChatRoutes } from "./modules/chat/routes";

export async function registerRoutes(app: FastifyInstance) {
  await registerAuthRoutes(app);
  await registerAdminRoutes(app);
  await registerProviderRoutes(app);
  await registerMarketplaceRoutes(app);
  await registerBookingRoutes(app);
  await registerPaymentRoutes(app);
  await registerChatRoutes(app);
}