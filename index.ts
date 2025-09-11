import { getBot } from "./telegram";

async function main() {
  const bot = await getBot();
  bot.launch({ dropPendingUpdates: true });
  console.log("✅ Bot started.");

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

main();
