import { redis } from ".";

type User = {
  id: string;
  first_seen: string;
  last_seen: string;
  name: string;
  username: string;
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

  await redis.hsetnx(key, "first_seen", now);

  await redis.hset(key, {
    id: id.toString(),
    name: name ?? username,
    last_seen: now,
  });
}

export async function getAllUsers(): Promise<User[]> {
  const users: User[] = [];
  let cursor = 0;

  do {
    const [next, keys] = await redis.scan(cursor, {
      match: "user:*",
      count: 100,
    });
    cursor = Number(next);

    const pipe = redis.pipeline();
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
