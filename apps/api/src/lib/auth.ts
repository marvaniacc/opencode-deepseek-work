import { FastifyReply, FastifyRequest } from "fastify";

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  await request.authenticate(reply);
  return !!request.auth;
}

export async function requireRole(
  request: FastifyRequest,
  reply: FastifyReply,
  roles: string[]
): Promise<boolean> {
  if (!(await requireAuth(request, reply))) return false;
  if (!roles.includes(request.auth!.role)) {
    reply.code(403).send({ error: "forbidden" });
    return false;
  }
  return true;
}