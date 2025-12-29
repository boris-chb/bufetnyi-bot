import { session, Telegraf } from "telegraf";
import { redis } from "../redis";
import { getAllUsers, recordUser } from "../redis/actions";
import type { AppContext, AppSession } from "./context";
import { mainMenu as createMainMenu } from "./markup/main-menu";
import { mainStage } from "./scenes";
import { syncUsersToSheet } from "./google-sheets";

let bot: Telegraf<AppContext> | undefined;

// Constants
const ADMIN_ID = Number(process.env.ADMIN_ID);
const FEEDBACK_CHAT_ID = process.env.FEEDBACK_CHAT_ID;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GOOGLE_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1_q2yxUx4dI1hw05HmwAAwttKc8kGgQfHZGGX5lfPp0A/";
const REDIS_ACTIVE_USERS_KEY = "active_users";

export async function getBot() {
  if (!bot) {
    if (!TELEGRAM_BOT_TOKEN) {
      throw new Error("TELEGRAM_BOT_TOKEN is required");
    }
    bot = new Telegraf<AppContext>(TELEGRAM_BOT_TOKEN);
    bot.use(session({ defaultSession: (): AppSession => ({}) }));
    bot.use(mainStage.middleware());
  }

  bot.start(onStart);

  bot.action("main", async (ctx) => {
    const admin = isAdmin(ctx);
    const menu = createMainMenu(admin);
    await ctx.editMessageText(menu.text, { reply_markup: menu.reply_markup });
    await ctx.answerCbQuery();
  });

  bot.action(/^address:(.+)$/, (ctx) => {
    const path = ctx.match[1];

    ctx.scene.enter("address", { path });
  });

  bot.action("stats", async (ctx) => {
    if (!isAdmin(ctx)) return;

    await ctx.deleteMessage();

    const users = await getAllUsers();

    if (!users || users.length === 0) {
      await ctx.editMessageText("😔 Не нашел данных о пользователях");
      return;
    }

    try {
      await syncUsersToSheet(users);
      await ctx.reply(
        `Обновил <a href="${GOOGLE_SHEET_URL}">таблицу</a> успешно.`,
        { parse_mode: "HTML" }
      );
    } catch (error) {
      console.error("Failed to sync users to sheet:", error);
      await ctx.reply("❌ Ошибка при обновлении таблицы");
    }

    await onStart(ctx);
  });

  bot.action("feedback", async (ctx) => {
    await ctx.editMessageText(
      "✍️ Напишите свой отзыв ниже:\n\n<i>не забывайте в тексте указывать точку в которой вы были!</i>",
      { parse_mode: "HTML" }
    );
  });

  bot.on("message", async (ctx) => {
    if (!ctx.from || ctx.chat.type !== "private") return;

    const fromId = ctx.from.id;
    const chatId = ctx.chat.id;

    // Admin broadcasting
    if (ADMIN_ID && fromId === ADMIN_ID) {
      await handleAdminBroadcast(ctx);
      return;
    }

    // Normal user → forward to feedback group
    await forwardMessageToFeedback(ctx, chatId);

    // Reply user in private
    const admin = isAdmin(ctx);
    const menu = createMainMenu(admin);
    await ctx.reply("Спасибо за ваш отзыв 🍻");
    await ctx.reply(menu.text, { reply_markup: menu.reply_markup });
  });

  bot.command("stop", async (ctx) => {
    if (!ctx.from) return;

    const userId = ctx.from.id;
    const username = ctx.from.username;

    // Remove from active users set
    await redis.srem(REDIS_ACTIVE_USERS_KEY, userId.toString());

    // Delete user hash - try by username first if available, then scan by user ID
    let deleted = false;
    if (username) {
      const key = `user:${username}`;
      const exists = await redis.exists(key);
      if (exists) {
        await redis.del(key);
        deleted = true;
      }
    }

    // If not deleted by username (or no username), find and delete by user ID
    if (!deleted) {
      await deleteUserByUserId(userId);
    }

    await ctx.reply("🫂 Всего хорошего, ждем вас еще!");
  });

  process.once("SIGINT", () => bot?.stop("SIGINT"));
  process.once("SIGTERM", () => bot?.stop("SIGTERM"));
  process.on("unhandledRejection", (err) => {
    try {
      console.error("❌ UNHANDLED REJECTION:", err);
    } catch {
      console.error("❌ UNHANDLED REJECTION (could not read message):", err);
    }
  });

  bot.catch(async (err, ctx) => {
    const admin = isAdmin(ctx);
    const menu = createMainMenu(admin);
    console.error("Unhandled error:", err);
    await ctx.editMessageText("Что-то пошло не так, попробуйте позже");
    await ctx.reply(menu.text, { reply_markup: menu.reply_markup });
  });

  return bot;
}

export async function broadcast(bot: Telegraf<AppContext>, message: string) {
  const userIds = await redis.smembers(REDIS_ACTIVE_USERS_KEY);

  for (const userIdStr of userIds) {
    const userId = Number(userIdStr);
    try {
      await bot.telegram.sendMessage(userId, message);
    } catch (err) {
      // Only suppress "chat not found" errors (user blocked bot/deleted account)
      // Don't log these as they're expected and spam the logs
      if (!isChatNotFoundError(err)) {
        console.error(`Failed to send message to ${userId}:`, err);
      }
    }
  }
}

async function onStart(ctx: AppContext) {
  if (!ctx.from) return;

  const admin = isAdmin(ctx);
  const menu = createMainMenu(admin);

  await recordUser({
    id: ctx.from.id,
    username: ctx.from.username || ctx.from.id.toString(),
    name: `${ctx.from.first_name || ""} ${ctx.from.last_name || ""}`.trim(),
  });

  // Add user to active users set
  await redis.sadd(REDIS_ACTIVE_USERS_KEY, ctx.from.id.toString());

  await ctx.reply(menu.text, { reply_markup: menu.reply_markup });
}

function isAdmin(ctx: AppContext): boolean {
  if (!ctx.from?.username) return false;
  const ADMINS = process.env.ADMINS?.split(",") ?? [];
  return ADMINS.includes(ctx.from.username);
}

function isChatNotFoundError(err: unknown): boolean {
  if (err && typeof err === "object" && "response" in err) {
    const response = (
      err as { response?: { error_code?: number; description?: string } }
    ).response;
    return (
      response?.error_code === 400 &&
      (response?.description?.includes("chat not found") ?? false)
    );
  }
  return false;
}

async function handleAdminBroadcast(ctx: AppContext) {
  if (!ctx.from || !ADMIN_ID || !ctx.message) return;

  console.log("admin broadcast");
  const userIds = await redis.smembers(REDIS_ACTIVE_USERS_KEY);

  for (const userIdStr of userIds) {
    const userId = Number(userIdStr);
    if (userId === ADMIN_ID) continue; // skip self

    try {
      if ("text" in ctx.message && ctx.message.text) {
        await ctx.telegram.sendMessage(userId, ctx.message.text);
      } else if ("document" in ctx.message && ctx.message.document) {
        await ctx.telegram.sendDocument(userId, ctx.message.document.file_id, {
          caption: ctx.message.caption || "",
        });
      } else if ("photo" in ctx.message && ctx.message.photo.length > 0) {
        await ctx.telegram.sendPhoto(userId, ctx.message.photo[0].file_id, {
          caption: ctx.message.caption || "",
        });
      } else if ("video" in ctx.message && ctx.message.video) {
        await ctx.telegram.sendVideo(userId, ctx.message.video.file_id, {
          caption: ctx.message.caption || "",
        });
      } else if ("location" in ctx.message && ctx.message.location) {
        await ctx.telegram.sendLocation(
          userId,
          ctx.message.location.latitude,
          ctx.message.location.longitude
        );
      }
    } catch (err: any) {
      // remove users who blocked the bot or deleted their account
      if (err?.response?.description === "Bad Request: chat not found") {
        await redis.srem(REDIS_ACTIVE_USERS_KEY, userIdStr);
        console.log(`Removed inactive user ${userId}`);
      } else {
        console.error(
          `Failed to send to ${userId}:`,
          err.response?.description || err.message
        );
      }
    }
  }
}

async function forwardMessageToFeedback(
  ctx: AppContext,
  chatId: number
): Promise<void> {
  if (!FEEDBACK_CHAT_ID || !ctx.message) {
    if (!FEEDBACK_CHAT_ID) {
      console.warn("FEEDBACK_CHAT_ID not set, skipping message forward");
    }
    return;
  }

  try {
    await ctx.telegram.forwardMessage(
      FEEDBACK_CHAT_ID,
      chatId,
      ctx.message.message_id
    );
  } catch (err) {
    console.error("Failed to forward message to feedback:", err);
    if (ctx.chat?.type === "private") {
      await ctx.reply("Что-то пошло не так, попробуйте позже 😔");
    }
  }
}

async function deleteUserByUserId(userId: number): Promise<void> {
  // Scan for all user keys and find the one matching this user ID
  let cursor = 0;
  do {
    const [next, keys] = await redis.scan(cursor, {
      match: "user:*",
      count: 100,
    });
    cursor = Number(next);

    for (const key of keys) {
      const userData = await redis.hgetall<{ id: string }>(key);
      if (userData?.id === userId.toString()) {
        await redis.del(key);
        return;
      }
    }
  } while (cursor !== 0);
}
