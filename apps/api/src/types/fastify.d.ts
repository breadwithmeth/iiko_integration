import "@fastify/jwt";
import type { Role } from "@iiko-call-center/shared";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; role: Role; jti: string; name: string; email: string };
    user: { sub: string; role: Role; jti: string; name: string; email: string };
  }
}
