import { redisClient } from ".";

export type User = {
  id: string;
  first_seen: string;
  last_seen: string;
  name: string;
  username: string;
};

export type Restaurant = {
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

export async function recordUser({
  id,
  username,
  name,
}: {
  id: number;
  username: string;
  name?: string;
}) {
  const key = `user:${username}`;
  const now = Date.now().toString();

  await redisClient.hsetnx(key, "first_seen", now);

  await redisClient.hset(key, {
    id: id.toString(),
    name: name ?? username,
    last_seen: now,
  });

  // reverse index so we can find user by numeric ID without a full scan
  await redisClient.set(`userid:${id}`, username);
}

export async function getAllUsers(): Promise<User[]> {
  const users: User[] = [];
  let cursor = 0;

  do {
    const [next, keys] = await redisClient.scan(cursor, {
      match: "user:*",
      count: 100,
    });

    cursor = Number(next);

    if (keys.length === 0) continue;

    const pipe = redisClient.pipeline();
    keys.forEach((k) => pipe.hgetall<User>(k));
    const results = await pipe.exec();

    results.forEach((data, i) => {
      const key = keys[i];
      const username = key.replace("user:", "");
      users.push({ ...(data as User), username });
    });
  } while (cursor !== 0);

  users.sort((a, b) => Number(b.first_seen) - Number(a.first_seen));

  return users;
}

export async function getRestaurants(): Promise<Restaurant[]> {
  let cursor = 0;
  const keys: string[] = [];

  do {
    const [next, batch] = await redisClient.scan(cursor, {
      match: "restaurant:*",
      count: 100,
    });
    cursor = +next;
    keys.push(...batch);
  } while (cursor !== 0);

  if (keys.length === 0) return [];

  const pipe = redisClient.pipeline();
  keys.forEach((k) => pipe.hgetall<Record<string, any>>(k));
  const results = await pipe.exec();

  const restaurants: Restaurant[] = [];
  for (const data of results) {
    if (!data) continue;
    const restaurant = { ...data } as any;
    if (typeof restaurant.hours === "string") {
      try {
        restaurant.hours = JSON.parse(restaurant.hours);
      } catch {}
    }
    restaurants.push(restaurant as Restaurant);
  }

  return restaurants;
}

export async function deleteUserByUserId(userId: number): Promise<void> {
  const username = await redisClient.get<string>(`userid:${userId}`);
  if (username) {
    await redisClient.del(`user:${username}`);
    await redisClient.del(`userid:${userId}`);
    return;
  }

  // fallback scan for users created before the reverse index existed
  let cursor = 0;
  do {
    const [next, keys] = await redisClient.scan(cursor, {
      match: "user:*",
      count: 100,
    });
    cursor = Number(next);

    for (const key of keys) {
      const userData = await redisClient.hgetall<{ id: string }>(key);
      if (userData?.id === userId.toString()) {
        await redisClient.del(key);
        return;
      }
    }
  } while (cursor !== 0);
}
