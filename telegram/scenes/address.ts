import { Scenes } from "telegraf";
import type { MyContext } from "..";

export const address = new Scenes.BaseScene<MyContext>("address");

export type Address = {
  id: string;
  name: string;
  text: string;
  url: string;
};

const DUMMY_ADDRESSES = [
  {
    name: "Алкобуфет на Сретенке",
    id: "1",
    text: `
👨‍🍳 Горбуфет Шашлычная на Пятницкой
📍 Адрес: Москва, Пятницкая ул, 16, стр.1
📞 Номер: +7 916 805 2630
@gurbufet_paveletskaya
🗓️ Вс-Чт 12:00-02:00
🗓️ Пт-Сб 12:00-05:00
    `,
    url: "https://www.google.com/maps/place/%D0%90%D0%BB%D0%BA%D0%BE-%D0%B1%D1%83%D1%84%D0%B5%D1%82+%22%D0%A8%D0%B0%D1%88%D0%BB%D1%8B%D1%87%D0%BD%D0%B0%D1%8F%22/",
  },
  {
    name: "Горбуфет на Пятницкой",
    id: "2",
    text: "📍 Адрес 2",
    url: "",
  },
  {
    name: "Горбуфет на Маяковской",
    id: "3",
    text: "📍 Адрес 3",
    url: "",
  },
  {
    name: "Горбуфет на Пушкинской",
    id: "4",
    text: "📍 Адрес 4",
    url: "",
  },
  {
    name: "Горбуфет на Павелецкой",
    id: "5",
    text: "📍 Адрес 5",
    url: "",
  },
];

address.enter(async (ctx) => {
  console.log("[scenes] address enter:", ctx.scene.state);
  const path = ctx.scene.state.path;

  // fetch addresses from external
  if (!path) return;

  const listMenu = addressListMenu(DUMMY_ADDRESSES);

  if (path === "list") {
    await ctx.editMessageText(listMenu.text, {
      reply_markup: listMenu.reply_markup,
    });
  } else {
    const address = DUMMY_ADDRESSES.find((address) => address.id === path);
    if (!address) return;
    const menu = adressItem(address);

    await ctx.editMessageText(menu.text, {
      reply_markup: menu.reply_markup,
    });
  }
});

function adressItem(address: Address) {
  if (!address) {
    const addressList = addressListMenu(DUMMY_ADDRESSES);
    return {
      text: addressList.text,
      reply_markup: addressList.reply_markup,
    };
  }

  return {
    // HARDCODED
    text: address.text,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "📍 Открыть в Google Maps",
            url: address.url,
          },
        ],

        [
          { text: "Назад", callback_data: "address:list" },
          { text: "Главная", callback_data: "main" },
        ],
        // [{ text: "Address2", callback_data: "address2" }],
        // [{ text: "Address3", callback_data: "address3" }],
      ],
    },
  };
}

function addressListMenu(
  addressList: {
    id: string;
    name: string;
    text: string;
  }[]
) {
  const inline_keyboard = [
    ...addressList.map((address) => {
      return [
        {
          text: address.name,
          callback_data: `address:${address.id}`,
        },
      ];
    }),
    [{ text: "Назад", callback_data: "main" }],
  ];

  return {
    text: "📌 Какая точка интересует?",
    reply_markup: {
      inline_keyboard,
    },
  };
}
