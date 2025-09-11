import { Context, Scenes, session, Telegraf } from "telegraf";
import { mainMenu as createMainMenu } from "./markup/main-menu";
import { mainStage } from "./scenes";
import { redis } from "../redis";

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

  const menu = createMainMenu();

  bot.start(async (ctx) => {
    await trackUser(ctx.from!.id);
    await ctx.reply(menu.text, { reply_markup: menu.reply_markup });
  });

  bot.action("main", (ctx) => {
    ctx.editMessageText(menu.text, { reply_markup: menu.reply_markup });
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

  bot.on("message", async (ctx) => {
    const fromId = ctx.from!.id;
    if (!bot) return;
    if (fromId === process.env.ADMIN_ID) {
      // Admin broadcasting
      const userIds = await redis.smembers("active_users");

      for (const userId of userIds) {
        // if (+userId === ADMIN_ID) continue; // skip self
        try {
          if ("text" in ctx.message) {
            await bot.telegram.sendMessage(userId, ctx.message.text!);
          } else if ("document" in ctx.message) {
            await bot.telegram.sendDocument(
              userId,
              ctx.message.document!.file_id
            );
          } else if ("photo" in ctx.message) {
            await bot.telegram.sendPhoto(userId, ctx.message.photo![0].file_id);
          } else if ("video" in ctx.message) {
            await bot.telegram.sendVideo(userId, ctx.message.video!.file_id);
          } else if ("location" in ctx.message) {
            await bot.telegram.sendLocation(
              userId,
              ctx.message.location!.latitude,
              ctx.message.location!.longitude
            );
          }
          // add other types as needed
        } catch (err) {
          console.error(`Failed to send to ${userId}`, err);
        }
      }
    } else {
      // Normal user → forward to admin
      try {
        await ctx.forwardMessage(
          process.env.ADMIN_ID,
          ctx.chat.id,
          ctx.message.message_id
        );
      } catch (err) {
        console.error("Failed to forward to admin:", err);
      }
    }
  });

  return bot;
}

export async function trackUser(userId: number) {
  const isNew = !(await redis.sismember("active_users", userId));
  if (isNew) {
    await redis.sadd("active_users", userId);
  }
  return isNew;
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
