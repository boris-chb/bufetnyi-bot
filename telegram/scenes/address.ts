import { Scenes } from "telegraf";
import { bold, fmt, link } from "telegraf/format";
import type { AppContext } from "../context";

export const address = new Scenes.BaseScene<AppContext>("address");

export type Address = {
  id: string;
  name: string;
  address: string;
  phone: string;
  telegram: string | null;
  hours: {
    sun_thu: string;
    fri_sat: string;
  };
  url: string;
};

const ADDRESSES: Address[] = [
  {
    id: "1",
    name: "Горбуфет Шашлычная на Пятницкой",
    address: "Москва, Пятницкая ул, 16, стр.1",
    phone: "+7 916 805 2630",
    telegram: "gurbufet_pyatnitskaya",
    hours: {
      sun_thu: "12:00-02:00",
      fri_sat: "12:00-05:00",
    },
    url: "https://yandex.ru/maps/-/CCUDZEAe-A",
  },
  {
    id: "2",
    name: "Горбуфет Шашлычная на Сретенке",
    address: "Москва, Сретенка 36",
    phone: "+7915 277-68-84",
    telegram: "alkobufet_shashlik_sretenka",
    hours: {
      sun_thu: "12:00-02:00",
      fri_sat: "12:00-05:00",
    },
    url: "https://yandex.ru/maps/-/CCUDZAAbWB",
  },
  {
    id: "3",
    name: "Горбуфет Шашлычная на Павелецкой",
    address: "Москва, Новокузнецкая 39",
    phone: "+7909 990-93-10",
    telegram: "gurbufet_paveletskaya",
    hours: {
      sun_thu: "12:00-01:00",
      fri_sat: "12:00-03:00",
    },
    url: "https://yandex.ru/maps/org/gorbufet_shashlychnaya/242127509628/",
  },
  {
    id: "4",
    name: "Горбуфет Шашлычная на Маяковской",
    address: "Москва, 2-ая Тверская-Ямская, 2",
    phone: "+7962 945-95-49",
    telegram: null,
    hours: {
      sun_thu: "12:00-02:00",
      fri_sat: "12:00-05:00",
    },
    url: "https://yandex.ru/maps/org/214066755218",
  },
  {
    id: "5",
    name: "Горбуфет Пельменная на Тверской",
    address: "Москва, малая Дмитровка, 3",
    phone: "+7 916 963 7962",
    telegram: "gorbufet_pelmennaya",
    hours: {
      sun_thu: "12:00-01:00",
      fri_sat: "12:00-03:00",
    },
    url: "https://yandex.ru/maps/-/CLUsN0Pn",
  },
];

address.enter(async (ctx) => {
  console.log("[scenes] address enter:", ctx.scene.state);
  const path = ctx.scene.state.path;

  // fetch addresses from external
  if (!path) return;

  const listMenu = addressListMenu(ADDRESSES);

  if (path === "list") {
    await ctx.editMessageText(listMenu.text, {
      reply_markup: listMenu.reply_markup,
    });
  } else {
    const address = ADDRESSES.find((address) => address.id === path);
    if (!address) {
      console.log("address not found");
      return;
    }
    const menu = adressItem(address);

    await ctx.editMessageText(menu.text, {
      reply_markup: menu.reply_markup,
    });
  }

  await ctx.answerCbQuery();
});

function adressItem(address: Address) {
  if (!address) {
    const addressList = addressListMenu(ADDRESSES);
    return {
      text: addressList.text,
      reply_markup: addressList.reply_markup,
    };
  }

  const formattedMessage = fmt`
👨‍🍳${bold`${address.name}`}
📍${address.address}
📞${bold`Номер:`} ${address.phone}
🗓️${bold`Пн-Чт:`} ${address.hours.sun_thu}
🗓️${bold`Пт-Сб:`} ${address.hours.fri_sat}
${
  address.telegram
    ? link("Связаться с нами в Telegram", `https://t.me/${address.telegram}`)
    : ""
}
`;

  return {
    text: formattedMessage,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "📍 Открыть в Яндекс Карты",
            url: address.url,
          },
        ],

        [
          { text: "Назад", callback_data: "address:list" },
          { text: "Главная", callback_data: "main" },
        ],
      ],
    },
  };
}

function addressListMenu(addressList: Address[]) {
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

function handleMention(label: string, username: string) {
  return fmt`<a href="tg://resolve?domain=${username}">${label}</a>`;
}
