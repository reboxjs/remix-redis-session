import {
  SessionIdStorageStrategy,
  SessionStorage,
  createSessionStorageFactory,
} from "@remix-run/server-runtime";
import { createCookie } from "@remix-run/node";
import crypto from "crypto"; // Correct way to import crypto in ESM

import { Redis, RedisOptions } from "ioredis";

function genRandomID(): string {
  const randomBytes = crypto.randomBytes(8); // Use the correct method
  return Buffer.from(randomBytes).toString("hex");
}

const expiresToSeconds = (expires: Date) => {
  const now = new Date();
  const expiresDate = new Date(expires);
  const secondsDelta = Math.round(
    (expiresDate.getTime() - now.getTime()) / 1000
  );
  return secondsDelta < 0 ? 0 : secondsDelta;
};

type redisSessionArguments = {
  appName: string;
  cookie: SessionIdStorageStrategy["cookie"];
  options: {
    redisConfig?: RedisOptions;
    redisClient?: Redis;
  };
};

export function createRedisSessionStorage({
  appName,
  cookie,
  options,
}: redisSessionArguments): SessionStorage {
  let redis: Redis;
  if (options.redisClient) {
    redis = options.redisClient;
  } else if (options.redisConfig) {
    redis = new Redis(options.redisConfig);
  } else {
    throw new Error(
      "Need to provide either options.redisConfig or options.redisClient"
    );
  }

  const createSessionStorage = createSessionStorageFactory(createCookie);

  const formatKey = (id: string) => `${appName}:Sessions:${id}`;

  return createSessionStorage({
    cookie,
    async createData(data, expires) {
      const id = genRandomID();
      const key = formatKey(id)
      if (expires) {
        await redis.set(
          key,
          JSON.stringify(data),
          "EX",
          expiresToSeconds(expires)
        );
      } else {
        await redis.set(key, JSON.stringify(data));
      }
      return key;
    },
    async readData(id) {
      const data = await redis.get(id);
      if (data) {
        return JSON.parse(data);
      }
      return null;
    },
    async updateData(id, data, expires) {
      if (expires) {
        await redis.set(
          id,
          JSON.stringify(data),
          "EX",
          expiresToSeconds(expires)
        );
      } else {
        await redis.set(id, JSON.stringify(data));
      }
    },
    async deleteData(id) {
      await redis.del(id);
    },
  });
}
