import fp from "fastify-plugin";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyJwt from "@fastify/jwt";
import { prisma } from "@wishubest/db";
import { loadConfig } from "../config";

declare module "fastify" {
  interface FastifyRequest {
    auth: { userId: string; role: string; jti: string } | null;
    user: any | null;
    authenticate: (reply: FastifyReply) => Promise<void>;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; jti: string; role: string };
    user: any;
  }
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  const config = loadConfig();

  await app.register(fastifyCookie);
  await app.register(fastifyJwt, {
    secret: config.jwtSecret,
    cookie: { cookieName: config.authCookie, signed: false },
  });

  app.decorateRequest("auth", null as any);

  app.decorateRequest("authenticate", async function (this: FastifyRequest, reply: FastifyReply) {
    let decoded: { sub: string; jti: string; role: string } | null = null;

    if (requestHasAuthHeader(this)) {
      try {
        decoded = (await this.jwtVerify()) as any;
      } catch {
        // fall through to cookie attempt
      }
    } else {
      const cookie = this.cookies[config.authCookie];
      if (cookie) {
        try {
          decoded = (await this.jwtVerify()) as any;
        } catch {
          // invalid cookie
        }
      }
    }

    if (!decoded) {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }

    const session = await prisma.session.findUnique({ where: { jti: decoded.jti } });
    if (!session || session.revokedAt) {
      reply.code(401).send({ error: "session_revoked" });
      return;
    }
    if (session.expiresAt.getTime() < Date.now()) {
      reply.code(401).send({ error: "session_expired" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
    if (!user || user.status !== "active") {
      reply.code(401).send({ error: "user_disabled" });
      return;
    }

    this.auth = { userId: user.id, role: user.role, jti: session.jti };
    this.user = user;
  });
});

function requestHasAuthHeader(request: FastifyRequest): boolean {
  return typeof request.headers.authorization === "string" && request.headers.authorization.length > 0;
}