import { Context, Scenes, session, Telegraf } from "telegraf";
import { mainMenu as createMainMenu } from "./markup/main-menu";
import { mainStage } from "./scenes";
import { redis } from "../redis";
import { getAllUsers, recordUser } from "../redis/actions";

let bot: Telegraf<MyContext> | undefined;

export interface MySceneSession extends Scenes.SceneSessionData {
  sceneSessionProp: string;
}

export interface MyContext extends Context {
  session: MySession;
  scene: Scenes.SceneContextScene<MyContext, MySceneSession>;
  path: string;
}

export interface MySession extends Scenes.SceneSession<MySceneSession> {
  // Add other session properties here if needed
}

export async function getBot() {
  if (!bot) {
    bot = new Telegraf<MyContext>(process.env.TELEGRAM_BOT_TOKEN!);
    // bot.use(playerStage.middleware());

    bot.use(session({ defaultSession: (): MySession => ({}) }));
    bot.use(mainStage.middleware());
  }

  bot.start(onStart);

  bot.action("main", async (ctx) => {
    await ctx.editMessageText(menu.text, { reply_markup: menu.reply_markup });
  });

  bot.action(/^address:(.+)$/, (ctx) => {
    const path = ctx.match[1];

    ctx.scene.enter("address", { path });
  });

  bot.action(/^menu:(.+)$/, async (ctx) => {
    const menuType = ctx.match[1];

    const filePath = Bun.file(`files/menu-${menuType}.pdf`);

    await ctx.deleteMessage();
    if (await filePath.exists()) {
      await ctx.replyWithDocument({ source: `./files/menu-${menuType}.pdf` });
    } else {
      await ctx.reply("Меню не найдено.");
    }
    await ctx.reply(menu.text, { reply_markup: menu.reply_markup });
  });

  bot.command("stop", async (ctx) => {
    const userId = ctx.from.id;
    const key = `user:${ctx.from.username}`;

    await redis.srem("active_users", userId);
    await redis.del(key);

    await ctx.reply("🫂 Всего хорошего, ждем вас еще!");
  });

  bot.action("stats", async (ctx) => {
    if (!isAdmin(ctx)) return;

    const users = await getAllUsers();

    if (!users || users.length === 0) {
      await ctx.reply("😔 Нет данных о пользователях");
      return;
    }

    const userListStr = users
      .map(
        (u) =>
          `<blockquote expandable>@${u.username} - <b>${u.name}</b> (<i>${u.id}</i>)\n<b>• Первый визит:</b> ${u.first_seen}\n<b>• Последний визит:</b> ${u.last_seen}</blockquote>`
      )
      .join("\n");

    await ctx.editMessageText(`📊 Статистика пользователей: ${userListStr}`, {
      parse_mode: "HTML",
    });

    await onStart(ctx);
  });

  bot.action("feedback", async (ctx) => {
    await ctx.editMessageText(
      "✍️ Напишите свой отзыв ниже:\n\n<i>не забывайте в тексте указывать точку в которой вы были!</i>",
      { parse_mode: "HTML" }
    );
  });

  bot.on("message", async (ctx) => {
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

  process.once("SIGINT", () => bot?.stop("SIGINT"));
  process.once("SIGTERM", () => bot?.stop("SIGTERM"));
  process.on("unhandledRejection", (err) => {
    console.error("❌ UNHANDLED REJECTION:", err);
  });

  bot.catch(async (err, ctx) => {
    console.error("Unhandled error:", err);
    await ctx.editMessageText("Что-то пошло не так, попробуйте позже");
    await ctx.reply(menu.text, { reply_markup: menu.reply_markup });
  });

  return bot;
}

export async function broadcast(bot: Telegraf<MyContext>, message: string) {
  const userIds = await redis.smembers("active_users");

  for (const userId of userIds) {
    try {
      await bot.telegram.sendMessage(userId, message);
    } catch (err) {
      console.error(`Failed to send message to ${userId}:`, err);
    }
  }
}

function isAdmin(ctx: MyContext) {
  const ADMINS = process.env.ADMINS?.split(",") ?? [];
  const isAdmin = ADMINS.includes(ctx.from!.username!);

  return isAdmin;
}

async function onStart(ctx: MyContext) {
  const admin = isAdmin(ctx);
  const menu = createMainMenu(admin);
  await recordUser({
    id: ctx.from!.id,
    username: ctx.from!.username!,
    name: `${ctx.from!.first_name || ""} ${ctx.from!.last_name || ""}`,
  });

  await ctx.reply(menu.text, { reply_markup: menu.reply_markup });
}
