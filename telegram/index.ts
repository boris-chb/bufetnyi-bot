import { session, Telegraf } from "telegraf";

import { redisClient } from "../redis";
import { deleteUserByUserId, getAllUsers, recordUser } from "../redis/actions";
import type { AppContext, AppSession } from "./context";
import { syncUsersToSheet } from "./google-sheets";
import { mainMenu as createMainMenu } from "./markup/main-menu";
import { mainStage } from "./scenes";
import { isAdmin, handleAdminBroadcast, forwardMessageToFeedback } from "./utils";

let bot: Telegraf<AppContext> | undefined;

export const FEEDBACK_CHAT_ID = process.env.FEEDBACK_CHAT_ID;
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
export const REDIS_ACTIVE_USERS_KEY = "active_users";
export const GOOGLE_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1_q2yxUx4dI1hw05HmwAAwttKc8kGgQfHZGGX5lfPp0A/";

export async function getBot() {
  if (!bot) {
    if (!TELEGRAM_BOT_TOKEN) {
      throw new Error("TELEGRAM_BOT_TOKEN is required");
    }
    bot = new Telegraf<AppContext>(TELEGRAM_BOT_TOKEN);
    bot.use(session({ defaultSession: (): AppSession => ({}) }));
    bot.use(mainStage.middleware());

    bot.start(onStart);

    bot.action("main", async (ctx) => {
      const menu = createMainMenu(isAdmin(ctx));
      await ctx.editMessageText(menu.text, { reply_markup: menu.reply_markup });
      await ctx.answerCbQuery();
    });

    bot.action(/^address:(.+)$/, (ctx) => {
      const path = ctx.match[1];
      ctx.scene.enter("address", { path });
    });

    bot.action("stats", async (ctx) => {
      if (!isAdmin(ctx)) return;

      await ctx.answerCbQuery();

      const users = await getAllUsers();

      if (!users || users.length === 0) {
        await ctx.reply("😔 Не нашел данных о пользователях");
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

      const menu = createMainMenu(true);
      await ctx.reply(menu.text, { reply_markup: menu.reply_markup });
    });

    bot.action("feedback", async (ctx) => {
      await ctx.editMessageText(
        "✍️ Напишите свой отзыв ниже:\n\n<i>не забывайте в тексте указывать точку в которой вы были!</i>",
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[{ text: "◀️ Назад", callback_data: "main" }]],
          },
        }
      );
      await ctx.answerCbQuery();
    });

    bot.on("message", async (ctx) => {
      if (!ctx.from || ctx.chat.type !== "private") return;

      const chatId = ctx.chat.id;

      if (isAdmin(ctx)) {
        await handleAdminBroadcast(ctx, bot!);
        return;
      }

      await forwardMessageToFeedback(ctx, chatId);

      await ctx.reply("Спасибо за ваш отзыв 🍻");
      const menu = createMainMenu(false);
      await ctx.reply(menu.text, { reply_markup: menu.reply_markup });
    });

    bot.command("stop", async (ctx) => {
      if (!ctx.from) return;

      const userId = ctx.from.id;
      const username = ctx.from.username;

      await redisClient.srem(REDIS_ACTIVE_USERS_KEY, userId.toString());

      let deleted = false;
      if (username) {
        const key = `user:${username}`;
        const exists = await redisClient.exists(key);
        if (exists) {
          await redisClient.del(key);
          await redisClient.del(`userid:${userId}`);
          deleted = true;
        }
      }

      if (!deleted) {
        await deleteUserByUserId(userId);
      }

      await ctx.reply("🫂 Всего хорошего, ждем вас еще!");
    });

    bot.catch(async (err, ctx) => {
      console.error("Unhandled error:", err);
      try {
        const menu = createMainMenu(isAdmin(ctx));
        await ctx.reply(menu.text, { reply_markup: menu.reply_markup });
      } catch {
        // ignore reply failures in error handler
      }
    });

    process.on("unhandledRejection", (err) => {
      console.error("❌ UNHANDLED REJECTION:", err);
    });
  }

  return bot;
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

  await redisClient.sadd(REDIS_ACTIVE_USERS_KEY, ctx.from.id.toString());

  await ctx.reply(menu.text, { reply_markup: menu.reply_markup });
}
