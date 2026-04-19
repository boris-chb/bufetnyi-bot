import { Scenes } from "telegraf";
import { bold, fmt, link } from "telegraf/format";
import { getRestaurants, Restaurant } from "../../redis/actions";
import type { AppContext } from "../context";

export const address = new Scenes.BaseScene<AppContext>("address");

address.enter(async (ctx) => {
  // @ts-expect-error
  const path = ctx.scene.state.path;

  const restaurants = await getRestaurants();

  if (!path) return;

  const listMenu = restaurantListMenu(restaurants);

  if (path === "list") {
    await ctx.editMessageText(listMenu.text, {
      reply_markup: listMenu.reply_markup,
    });
  } else {
    const address = restaurants.find((address) => +address.id === +path);
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

function adressItem(restaurant: Restaurant) {
  if (!restaurant) {
    const addressList = restaurantListMenu(restaurant);
    return {
      text: addressList.text,
      reply_markup: addressList.reply_markup,
    };
  }

  const formattedMessage = fmt`
👨‍🍳${bold`${restaurant.name}`}
📍${restaurant.address}
📞${bold`Номер:`} ${restaurant.phone}
🗓️${bold`Пн-Чт:`} ${restaurant.hours.sun_thu}
🗓️${bold`Пт-Сб:`} ${restaurant.hours.fri_sat}
${
  restaurant.telegram
    ? link("Связаться с нами в Telegram", `https://t.me/${restaurant.telegram}`)
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
            url: restaurant.url,
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

function restaurantListMenu(restaurants: Restaurant[]) {
  const inline_keyboard = [
    ...restaurants.map((address) => {
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

