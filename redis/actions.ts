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
  const pattern = "restaurant:*";
  let cursor = 0;
  const allRestaurants: Restaurant[] = [];

  try {
    do {
      const [nextCursor, keys] = await redisClient.scan(cursor, {
        match: pattern,
        count: 100,
      });

      cursor = +nextCursor;

      if (keys.length > 0) {
        const pipelineResults = await Promise.all(
          keys.map((key) => redisClient.hgetall<Record<string, any>>(key))
        );

        pipelineResults.forEach((data) => {
          if (data) {
            const restaurant = { ...data } as any;

            if (typeof restaurant.hours === "string") {
              try {
                restaurant.hours = JSON.parse(restaurant.hours);
              } catch (e) {}
            }

            allRestaurants.push(restaurant as Restaurant);
          }
        });
      }
    } while (cursor !== 0);

    return allRestaurants;
  } catch (error) {
    throw error;
  }
}

export async function deleteUserByUserId(userId: number): Promise<void> {
  // Scan for all user keys and find the one matching this user ID
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
