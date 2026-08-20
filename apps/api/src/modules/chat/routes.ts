import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@wishubest/db";
import { badRequest, notFound, forbidden, conflict } from "../../lib/httpError";
import { requireRole, requireAuth } from "../../lib/auth";
import { encryptSecret, maskSecret } from "../../lib/crypto";
import { loadConfig } from "../../config";
import { translateWithActiveSetting } from "../../lib/ai/translation";
import { createAuditLog, createNotification } from "../../lib/helpers";

const LOCALES = ["fa", "en", "ar"];

export async function registerChatRoutes(app: FastifyInstance) {
  const config = loadConfig();

  // ----------------------------------------------------------------
  // Patient: create or fetch the active thread with a provider
  // ----------------------------------------------------------------

  app.post("/chat/threads", async (request, reply) => {
    if (!(await requireRole(request, reply, ["patient"]))) return;
    const body = request.body as any;
    if (!body.providerId) throw badRequest("provider_required");

    const patient = await prisma.patientProfile.findUnique({
      where: { userId: request.auth!.userId },
    });
    if (!patient) throw forbidden("patient_profile_required");

    const provider = await prisma.providerProfile.findFirst({
      where: { id: body.providerId, providerType: "doctor" },
    });
    if (!provider) throw notFound("provider_not_found");

    const existing = await prisma.chatThread.findFirst({
      where: { patientId: patient.id, providerId: provider.id, status: "active" },
    });
    if (existing) return reply.send({ thread: serializeThread(existing) });

    const thread = await prisma.chatThread.create({
      data: {
        patientId: patient.id,
        providerId: provider.id,
        bookingId: body.bookingId ?? null,
      },
    });
    reply.code(201).send({ thread: serializeThread(thread) });
  });

  // ----------------------------------------------------------------
  // List threads for the current user
  // ----------------------------------------------------------------

  app.get("/chat/threads", async (request, reply) => {
    if (!(await requireAuth(request, reply))) return;
    const role = request.auth!.role;
    const where: any = {};
    if (role === "patient") {
      const patient = await prisma.patientProfile.findUnique({ where: { userId: request.auth!.userId } });
      if (!patient) throw forbidden("patient_profile_required");
      where.patientId = patient.id;
    } else if (role === "provider") {
      const provider = await prisma.providerProfile.findUnique({ where: { userId: request.auth!.userId } });
      if (!provider) throw forbidden("provider_profile_required");
      where.providerId = provider.id;
    }

    const threads = await prisma.chatThread.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        patient: { include: { user: { select: { email: true } } } },
        provider: { include: { user: { select: { email: true } } } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { messages: true } },
      },
    });

    reply.send({
      threads: threads.map((t) => ({
        id: t.id,
        status: t.status,
        bookingId: t.bookingId,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        messageCount: t._count.messages,
        lastMessage: t.messages[0]
          ? {
              id: t.messages[0].id,
              text: t.messages[0].originalText,
              senderId: t.messages[0].senderId,
              createdAt: t.messages[0].createdAt,
            }
          : null,
        otherParty:
          role === "patient"
            ? {
                id: t.providerId,
                name: `${t.provider.title ?? ""} ${t.provider.specialty ?? ""}`.trim(),
              }
            : {
                id: t.patientId,
                name: `${t.patient.firstName} ${t.patient.lastName}`.trim(),
              },
      })),
    });
  });

  // ----------------------------------------------------------------
  // Messages (polling endpoint — returns messages after `after`)
  // ----------------------------------------------------------------

  app.get("/chat/threads/:id/messages", async (request, reply) => {
    if (!(await requireAuth(request, reply))) return;
    const { id } = request.params as { id: string };
    const { after } = request.query as { after?: string };
    const thread = await prisma.chatThread.findUnique({ where: { id } });
    if (!thread) throw notFound("thread_not_found");
    if (!(await canAccessThread(request, thread))) throw forbidden("not_thread_participant");

    const messages = await prisma.chatMessage.findMany({
      where: {
        threadId: id,
        ...(after ? { createdAt: { gt: new Date(after) } } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: 200,
    });

    reply.send({
      messages: messages.map((m) => ({
        id: m.id,
        threadId: m.threadId,
        senderId: m.senderId,
        senderLocale: m.senderLocale,
        originalText: m.originalText,
        edited: m.edited,
        createdAt: m.createdAt,
      })),
    });
  });

  // ----------------------------------------------------------------
  // Send a message
  // ----------------------------------------------------------------

  app.post("/chat/threads/:id/messages", async (request, reply) => {
    if (!(await requireAuth(request, reply))) return;
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) throw badRequest("text_required");
    if (text.length > 4000) throw badRequest("text_too_long");

    const thread = await prisma.chatThread.findUnique({ where: { id } });
    if (!thread) throw notFound("thread_not_found");
    if (!(await canAccessThread(request, thread))) throw forbidden("not_thread_participant");
    if (thread.status !== "active") throw conflict("thread_archived");

    const senderLocale = request.user.locale === "en" ? "en" : "fa";
    const message = await prisma.chatMessage.create({
      data: {
        threadId: id,
        senderId: request.auth!.userId,
        senderLocale,
        originalText: text,
      },
    });
    await prisma.chatThread.update({ where: { id }, data: { updatedAt: new Date() } });

    // Notify the other party.
    const otherUserId =
      request.auth!.role === "patient" ? (await providerUserFor(thread.providerId)) : (await patientUserFor(thread.patientId));
    if (otherUserId) {
      await createNotification({
        userId: otherUserId,
        type: "new_chat_message",
        title: "New message",
        body: text.slice(0, 120),
        payload: { threadId: id },
      });
    }

    reply.code(201).send({
      message: {
        id: message.id,
        threadId: message.threadId,
        senderId: message.senderId,
        senderLocale: message.senderLocale,
        originalText: message.originalText,
        edited: message.edited,
        createdAt: message.createdAt,
      },
    });
  });

  // ----------------------------------------------------------------
  // Translate a message (on-demand, cached per message+locale)
  // ----------------------------------------------------------------

  app.post("/chat/messages/:id/translate", async (request, reply) => {
    if (!(await requireAuth(request, reply))) return;
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const targetLocale = body.targetLocale ?? request.user.locale;
    if (!LOCALES.includes(targetLocale)) throw badRequest("invalid_target_locale");

    const message = await prisma.chatMessage.findUnique({
      where: { id },
      include: { thread: true },
    });
    if (!message) throw notFound("message_not_found");
    if (!(await canAccessThread(request, message.thread))) throw forbidden("not_thread_participant");

    // Do not translate your own messages — only the other party's.
    if (message.senderId === request.auth!.userId) throw forbidden("cannot_translate_own_message");

    // Cache hit → no AI call.
    const cached = await prisma.chatMessageTranslation.findUnique({
      where: { messageId_targetLocale: { messageId: id, targetLocale } },
    });
    if (cached) {
      return reply.send({
        translation: {
          messageId: id,
          targetLocale,
          translatedText: cached.translatedText,
          modelUsed: cached.modelUsed,
          cached: true,
          createdAt: cached.createdAt,
        },
      });
    }

    // Lazy AI call, then cache. One real AI request per (message, locale).
    const result = await translateWithActiveSetting(message.originalText, targetLocale);
    const stored = await prisma.chatMessageTranslation.create({
      data: {
        messageId: id,
        targetLocale,
        translatedText: result.translatedText,
        modelUsed: result.modelUsed,
      },
    });
    await createAuditLog({
      actorId: request.auth!.userId,
      action: "chat.message.translate",
      entityType: "ChatMessage",
      entityId: id,
      metadata: { targetLocale, modelUsed: result.modelUsed },
      ip: request.ip,
    });

    reply.send({
      translation: {
        messageId: id,
        targetLocale,
        translatedText: stored.translatedText,
        modelUsed: stored.modelUsed,
        cached: false,
        createdAt: stored.createdAt,
      },
    });
  });

  // ----------------------------------------------------------------
  // Archive a thread (either party)
  // ----------------------------------------------------------------

  app.post("/chat/threads/:id/archive", async (request, reply) => {
    if (!(await requireAuth(request, reply))) return;
    const { id } = request.params as { id: string };
    const thread = await prisma.chatThread.findUnique({ where: { id } });
    if (!thread) throw notFound("thread_not_found");
    if (!(await canAccessThread(request, thread))) throw forbidden("not_thread_participant");
    await prisma.chatThread.update({ where: { id }, data: { status: "archived" } });
    reply.send({ ok: true });
  });

  // ----------------------------------------------------------------
  // Admin: AI translation settings
  // ----------------------------------------------------------------

  app.get("/admin/ai-settings", async (request, reply) => {
    if (!(await requireRole(request, reply, ["admin"]))) return;
    const settings = await prisma.aiTranslationSetting.findMany({ orderBy: { updatedAt: "desc" } });
    reply.send({
      settings: settings.map((s) => ({
        id: s.id,
        provider: s.provider,
        apiKeyMasked: maskSecret(s.apiKeyEncrypted),
        hasApiKey: s.apiKeyEncrypted.length > 0,
        modelName: s.modelName,
        systemPrompt: s.systemPrompt,
        active: s.active,
        updatedAt: s.updatedAt,
      })),
    });
  });

  app.post("/admin/ai-settings", async (request, reply) => {
    if (!(await requireRole(request, reply, ["admin"]))) return;
    const body = request.body as any;
    if (!body.provider || !body.modelName || !body.systemPrompt) {
      throw badRequest("provider_model_prompt_required");
    }
    if (body.provider !== "openai" && body.provider !== "anthropic" && body.provider !== "mock") {
      throw badRequest("invalid_provider");
    }
    const apiKey = typeof body.apiKey === "string" && body.apiKey.trim() ? body.apiKey.trim() : null;
    if (body.provider !== "mock" && !apiKey) throw badRequest("api_key_required");
    const encrypted = encryptSecret(apiKey ?? "mock", config.dbEncryptionKey);

    const setting = await prisma.$transaction(async (tx) => {
      if (body.active) {
        await tx.aiTranslationSetting.updateMany({ where: { active: true }, data: { active: false } });
      }
      return tx.aiTranslationSetting.create({
        data: {
          provider: body.provider,
          apiKeyEncrypted: encrypted,
          modelName: body.modelName,
          systemPrompt: body.systemPrompt,
          active: body.active ?? false,
          updatedById: request.auth!.userId,
        },
      });
    });

    await createAuditLog({
      actorId: request.auth!.userId,
      action: "admin.ai_setting.create",
      entityType: "AiTranslationSetting",
      entityId: setting.id,
      metadata: { provider: setting.provider, modelName: setting.modelName, active: setting.active },
      ip: request.ip,
    });

    reply.code(201).send({
      setting: {
        id: setting.id,
        provider: setting.provider,
        apiKeyMasked: maskSecret(setting.apiKeyEncrypted),
        modelName: setting.modelName,
        systemPrompt: setting.systemPrompt,
        active: setting.active,
      },
    });
  });

  app.post("/admin/ai-settings/:id/activate", async (request, reply) => {
    if (!(await requireRole(request, reply, ["admin"]))) return;
    const { id } = request.params as { id: string };
    const setting = await prisma.aiTranslationSetting.findUnique({ where: { id } });
    if (!setting) throw notFound("ai_setting_not_found");
    await prisma.$transaction([
      prisma.aiTranslationSetting.updateMany({ where: { active: true }, data: { active: false } }),
      prisma.aiTranslationSetting.update({ where: { id }, data: { active: true } }),
    ]);
    await createAuditLog({
      actorId: request.auth!.userId,
      action: "admin.ai_setting.activate",
      entityType: "AiTranslationSetting",
      entityId: id,
      ip: request.ip,
    });
    reply.send({ ok: true });
  });

  app.post("/admin/ai-settings/:id/test", async (request, reply) => {
    if (!(await requireRole(request, reply, ["admin"]))) return;
    const { id } = request.params as { id: string };
    const setting = await prisma.aiTranslationSetting.findUnique({ where: { id } });
    if (!setting) throw notFound("ai_setting_not_found");
    const result = await translateWithActiveSetting("Hello doctor, I need help.", "fa");
    reply.send({ result });
  });
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

async function canAccessThread(
  request: FastifyRequest,
  thread: { patientId: string; providerId: string }
): Promise<boolean> {
  const role = request.auth!.role;
  if (role === "patient") {
    const patient = await prisma.patientProfile.findUnique({ where: { userId: request.auth!.userId } });
    return !!patient && patient.id === thread.patientId;
  }
  if (role === "provider") {
    const provider = await prisma.providerProfile.findUnique({ where: { userId: request.auth!.userId } });
    return !!provider && provider.id === thread.providerId;
  }
  return false;
}

function serializeThread(t: any) {
  return {
    id: t.id,
    patientId: t.patientId,
    providerId: t.providerId,
    bookingId: t.bookingId,
    status: t.status,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

async function providerUserFor(providerId: string): Promise<string | null> {
  const p = await prisma.providerProfile.findUnique({ where: { id: providerId }, include: { user: { select: { id: true } } } });
  return p?.user.id ?? null;
}

async function patientUserFor(patientId: string): Promise<string | null> {
  const p = await prisma.patientProfile.findUnique({ where: { id: patientId }, include: { user: { select: { id: true } } } });
  return p?.user.id ?? null;
}