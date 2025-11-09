import { session, Telegraf } from "telegraf";
import { redis } from "../redis";
import { getAllUsers, recordUser } from "../redis/actions";
import type { AppContext, AppSession } from "./context";
import { mainMenu as createMainMenu } from "./markup/main-menu";
import { mainStage } from "./scenes";
import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";

let bot: Telegraf<AppContext> | undefined;

type User = {
  id: string;
  name: string;
  username: string;
  first_seen: string;
  last_seen: string;
};

export async function getBot() {
  if (!bot) {
    bot = new Telegraf<AppContext>(process.env.TELEGRAM_BOT_TOKEN!);
    bot.use(session({ defaultSession: (): AppSession => ({}) }));
    bot.use(mainStage.middleware());
  }

  bot.start(onStart);

  bot.action("main", async (ctx) => {
    const admin = isAdmin(ctx);
    const menu = createMainMenu(admin);
    await ctx.editMessageText(menu.text, { reply_markup: menu.reply_markup });
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

    await syncUsers(users);

    await ctx.reply(
      'Обновил <a href="https://docs.google.com/spreadsheets/d/1_q2yxUx4dI1hw05HmwAAwttKc8kGgQfHZGGX5lfPp0A/">таблицу</a> успешно.',
      { parse_mode: "HTML" }
    );

    await onStart(ctx);
  });

  bot.action("feedback", async (ctx) => {
    await ctx.editMessageText(
      "✍️ Напишите свой отзыв ниже:\n\n<i>не забывайте в тексте указывать точку в которой вы были!</i>",
      { parse_mode: "HTML" }
    );
  });

  bot.on("message", async (ctx) => {
    const admin = isAdmin(ctx);
    const menu = createMainMenu(admin);
    const fromId = ctx.from!.id;
    const chatType = ctx.chat.type;
    const chatId = ctx.chat.id;

    // Only respond in private or when bot mentioned
    if (chatType !== "private") return;

    // Admin broadcasting
    if (fromId === +process.env.ADMIN_ID!) {
      console.log("admin boardcast");
      const userIds = await redis.smembers("active_users");
      for (const userId of userIds) {
        if (+userId === +process.env.ADMIN_ID!) return; // skip self
        try {
          if ("text" in ctx.message && ctx.message.text) {
            await ctx.telegram.sendMessage(userId, ctx.message.text);
          } else if ("document" in ctx.message) {
            await ctx.telegram.sendDocument(
              userId,
              ctx.message.document!.file_id,
              { caption: ctx.message.caption || "" }
            );
          } else if ("photo" in ctx.message) {
            await ctx.telegram.sendPhoto(
              userId,
              ctx.message.photo![0].file_id,
              {
                caption: ctx.message.caption || "",
              }
            );
          } else if ("video" in ctx.message) {
            await ctx.telegram.sendVideo(userId, ctx.message.video!.file_id, {
              caption: ctx.message.caption || "",
            });
          } else if ("location" in ctx.message) {
            await ctx.telegram.sendLocation(
              userId,
              ctx.message.location!.latitude,
              ctx.message.location!.longitude
            );
          }
        } catch (err) {
          console.error(`Failed to send to ${userId}`, err);
        }
      }
      return; // stop further processing for admin
    }

    // Normal user → forward to feedback group
    try {
      await ctx.telegram.forwardMessage(
        process.env.FEEDBACK_CHAT_ID!,
        chatId,
        ctx.message.message_id
      );
    } catch (err) {
      console.error("Failed to forward to admin:", err);
      if (chatType === "private") {
        await ctx.reply("Что-то пошло не так, попробуйте позже 😔");
      }
    }

    // Optional: reply user in private only
    if (chatType === "private") {
      await ctx.reply("Спасибо за ваш отзыв 🍻");
      await ctx.reply(menu.text, { reply_markup: menu.reply_markup });
    }
  });

  bot.command("stop", async (ctx) => {
    const userId = ctx.from.id;
    const key = `user:${ctx.from.username}`;

    await redis.srem("active_users", userId);
    await redis.del(key);

    await ctx.reply("🫂 Всего хорошего, ждем вас еще!");
  });

  process.once("SIGINT", () => bot?.stop("SIGINT"));
  process.once("SIGTERM", () => bot?.stop("SIGTERM"));
  process.on("unhandledRejection", (err) => {
    console.error("❌ UNHANDLED REJECTION:", err);
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
  const userIds = await redis.smembers("active_users");

  for (const userId of userIds) {
    try {
      await bot.telegram.sendMessage(userId, message);
    } catch (err) {
      console.error(`Failed to send message to ${userId}:`, err);
    }
  }
}

async function onStart(ctx: AppContext) {
  const admin = isAdmin(ctx);
  const menu = createMainMenu(admin);
  await recordUser({
    id: ctx.from!.id,
    username: ctx.from!.username!,
    name: `${ctx.from!.first_name || ""} ${ctx.from!.last_name || ""}`,
  });

  await ctx.reply(menu.text, { reply_markup: menu.reply_markup });
}

function isAdmin(ctx: AppContext) {
  const ADMINS = process.env.ADMINS?.split(",") ?? [];
  const isAdmin = ADMINS.includes(ctx.from!.username!);

  return isAdmin;
}

async function addUserToSheet(user: {
  id: number;
  name: string;
  username: string;
  join_date: number;
}) {
  const auth = new GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS!),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME;

  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:A`,
  });

  const existingIds = new Set(data.values?.flat() || []);

  if (existingIds.has(user.id.toString())) {
    console.log("User already exists");
    return;
  }

  const values = [
    [
      user.id,
      user.name,
      user.username,
      new Date(user.join_date).toLocaleString("ru-RU"),
    ],
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values,
    },
  });
}

async function syncUsers(users: User[]) {
  const auth = new GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS!),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME;

  const values = users.map((u) => [
    u.id,
    u.name.trim(),
    u.username,
    formatTimestampForSheets(+u.first_seen),
    formatTimestampForSheets(+u.last_seen),
  ]);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1:E${users.length + 1}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        ["id", "name", "username", "first_seen", "last_seen"],
        ...values,
      ],
    },
  });
}

function formatTimestampForSheets(ts: number) {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
