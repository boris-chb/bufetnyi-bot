export function mainMenu() {
  return {
    text: "Чем могу быть полезен? 👋",
    reply_markup: {
      inline_keyboard: [
        [{ text: "Адреса", callback_data: "address:list" }],
        [{ text: "Меню шашлычной", callback_data: "menu:shashlyk" }],
        [{ text: "Меню пельменной", callback_data: "menu:pelmen" }],
        [{ text: "Буфетная правда", url: "https://t.me/bufetnayapravda" }],
        [
          {
            text: "📱 Меню",
            web_app: { url: "https://shashlichnaya.vercel.app/" },
          },
        ],
        [
          {
            text: "Оставить отзыв",
            callback_data: "feedback",
          },
        ],

        // [
        //   {
        //     text: "📱 miniapp",
        //     web_app: {
        //       url: `https://tg-mini-app-flame.vercel.app/`,
        //     },
        //   },
        // ],
      ],
    },
  };
}
