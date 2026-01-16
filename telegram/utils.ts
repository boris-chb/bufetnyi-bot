import { Telegraf } from "telegraf";
import { redisClient } from "../redis";
import { AppContext } from "./context";
import { REDIS_ACTIVE_USERS_KEY, ADMIN_ID, FEEDBACK_CHAT_ID } from ".";

export async function broadcast(bot: Telegraf<AppContext>, message: string) {
  const userIds = await redisClient.smembers(REDIS_ACTIVE_USERS_KEY);

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

export function isAdmin(ctx: AppContext): boolean {
  if (!ctx.from?.username) return false;
  const ADMINS = process.env.ADMINS?.split(",") ?? [];
  return ADMINS.includes(ctx.from.username);
}

export function isChatNotFoundError(err: unknown): boolean {
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

export async function handleAdminBroadcast(ctx: AppContext) {
  if (!ctx.from || !ADMIN_ID || !ctx.message) return;

  console.log("admin broadcast");
  const userIds = await redisClient.smembers(REDIS_ACTIVE_USERS_KEY);

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
        await redisClient.srem(REDIS_ACTIVE_USERS_KEY, userIdStr);
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

export async function forwardMessageToFeedback(
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
