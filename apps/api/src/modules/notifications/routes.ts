import { FastifyInstance } from "fastify";
import { prisma } from "@wishubest/db";
import { requireAuth } from "../../lib/auth";
import { notFound, forbidden } from "../../lib/httpError";

export async function registerNotificationRoutes(app: FastifyInstance) {
  // ----------------------------------------------------------------
  // List my notifications (unread first)
  // ----------------------------------------------------------------

  app.get("/notifications", async (request, reply) => {
    if (!(await requireAuth(request, reply))) return;
    const items = await prisma.notification.findMany({
      where: { userId: request.auth!.userId },
      orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
      take: 50,
    });
    const unread = await prisma.notification.count({
      where: { userId: request.auth!.userId, readAt: null },
    });
    reply.send({
      unread,
      notifications: items.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        payload: n.payloadJson,
        readAt: n.readAt,
        createdAt: n.createdAt,
      })),
    });
  });

  // ----------------------------------------------------------------
  // Mark one notification as read (owner only)
  // ----------------------------------------------------------------

  app.post("/notifications/:id/read", async (request, reply) => {
    if (!(await requireAuth(request, reply))) return;
    const { id } = request.params as { id: string };
    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification) throw notFound("notification_not_found");
    if (notification.userId !== request.auth!.userId) throw forbidden("not_owned");
    await prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    reply.send({ ok: true });
  });

  // ----------------------------------------------------------------
  // Mark all as read
  // ----------------------------------------------------------------

  app.post("/notifications/read-all", async (request, reply) => {
    if (!(await requireAuth(request, reply))) return;
    await prisma.notification.updateMany({
      where: { userId: request.auth!.userId, readAt: null },
      data: { readAt: new Date() },
    });
    reply.send({ ok: true });
  });
}