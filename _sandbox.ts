import Fastify, { type FastifyInstance } from "fastify";
import { IncomingMessage, Server, ServerResponse } from "http";
import { getBot } from "./telegram/index.js";

const run = async () => {
  const server: FastifyInstance<Server, IncomingMessage, ServerResponse> =
    Fastify({ routerOptions: { maxParamLength: 5000 } });

  const bot = await getBot();

  server.post("/webhook", async (request, reply) => {
    await bot.handleUpdate(request.body as any);
    reply.code(200).send({ ok: true });
  });

  await server.listen({ port: 3000, host: "::" });
  console.log(`Bot webhook running on port 3000`);
};

run();
