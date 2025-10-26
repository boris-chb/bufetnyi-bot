export function mainMenu(admin = false) {
  const buttons = [
    [{ text: "📍 Адреса", callback_data: "address:list" }],
    [
      {
        text: "🥩 Меню шашлычной",
        web_app: { url: "https://shashlichnaya.vercel.app/menu/shashlyk" },
      },
    ],
    [
      {
        text: "🥟 Меню пельменной",
        web_app: { url: "https://shashlichnaya.vercel.app/menu/pelmen" },
      },
    ],
    [{ text: "📃 Буфетная правда", url: "https://t.me/bufetnayapravda" }],

    [
      {
        text: "✍️ Оставить отзыв",
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
  ];

  if (admin) {
    buttons.push([
      {
        text: "🛠 Статистика",
        callback_data: "stats",
      },
    ]);
  }

  return {
    text: "Чем могу быть полезен? 👋",
    reply_markup: {
      inline_keyboard: buttons,
    },
  };
}
