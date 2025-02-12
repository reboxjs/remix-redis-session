import {
  SessionIdStorageStrategy,
  SessionStorage,
  createSessionStorageFactory,
} from "@remix-run/server-runtime";
import { createCookie } from "@remix-run/cloudflare";
// Using the global Web Crypto API available in Cloudflare Workers; no need for node:crypto
import { Redis } from "@upstash/redis";
import { expiresToSeconds, formatKey } from "./common";

// Generates a random session ID using the Cloudflare global crypto API
function genRandomID(): string {
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, "0")).join("");
}

type RedisSessionArguments = {
  appName: string;
  cookie: SessionIdStorageStrategy["cookie"];
  options: {
    // Upstash Redis requires a URL and token for configuration.
    redisConfig?: { url: string; token: string };
    redisClient?: any;
  };
};

export function createRedisSessionStorage({
  appName,
  cookie,
  options,
}: RedisSessionArguments): SessionStorage {
  let redis: any;
  if (options.redisClient) {
    redis = options.redisClient;
  } else if (options.redisConfig) {
    redis = new Redis(options.redisConfig);
  } else {
    throw new Error("A compatible Redis client must be provided for Cloudflare Workers. Consider using a client like @upstash/redis.");
  }

  // Use Cloudflare version of createCookie
  const createSessionStorage = createSessionStorageFactory(createCookie);

  return createSessionStorage({
    cookie,
    async createData(data, expires) {
      const id = genRandomID();
      const key = formatKey(appName, id);
      if (expires) {
        await redis.set(
          key,
          JSON.stringify(data),
          { ex: expiresToSeconds(expires) }
        );
      } else {
        await redis.set(key, JSON.stringify(data));
      }
      return key;
    },
    async readData(id) {
      const data = await redis.get(id);
      if (data) {
        // In Cloudflare, you might want to return the raw data as needed.
        return data;
      }
      return null;
    },
    async updateData(id, data, expires) {
      if (expires) {
        await redis.set(
          id,
          JSON.stringify(data),
          { ex: expiresToSeconds(expires) }
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