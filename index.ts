import Fastify from "fastify";
import { getBot } from "./telegram/index.ts";

const PORT = Number(process.env.PORT) || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

async function main() {
  const bot = await getBot();

  if (process.env.WEBHOOK_URL) {
    const app = Fastify();

    app.post(`/webhook/${WEBHOOK_SECRET}`, async (req, reply) => {
      await bot.handleUpdate(req.body as any);
      reply.code(200).send({ ok: true });
    });

    app.get("/health", async (_req, reply) => {
      reply.code(200).send({ ok: true });
    });

    await bot.telegram.setWebhook(
      `${process.env.WEBHOOK_URL}/webhook/${WEBHOOK_SECRET}`
    );

    await app.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`✅ Bot running via webhook on port ${PORT}`);
  } else {
    await bot.telegram.deleteWebhook();
    bot.launch({ dropPendingUpdates: true });
    console.log("✅ Bot running via polling");
  }

  const stop = () => {
    if (!process.env.WEBHOOK_URL) bot.stop();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

main();
