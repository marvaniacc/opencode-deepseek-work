import fp from "fastify-plugin";
import { FastifyInstance, FastifyError } from "fastify";

export const errorPlugin = fp(async (app: FastifyInstance) => {
  app.setErrorHandler((err: FastifyError, request, reply) => {
    const statusCode = (err as any).statusCode ?? 500;
    const message = statusCode === 500 ? "internal_error" : err.message;
    if (statusCode >= 500) {
      request.log.error({ err, url: request.url }, "unhandled error");
    }
    reply.code(statusCode).send({
      error: message,
      ...((err as any).details ? { details: (err as any).details } : {}),
    });
  });
});