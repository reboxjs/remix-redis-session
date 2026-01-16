import {
  SessionIdStorageStrategy,
  SessionStorage,
  createSessionStorageFactory,
} from "@remix-run/server-runtime";
import { createCookie } from "@remix-run/node";
import crypto from "node:crypto";
import { Redis, RedisOptions } from "ioredis";
import { expiresToSeconds, formatKey } from "./common.js";

// Re-export ioredis types for consumer convenience
export type { Redis, RedisOptions } from "ioredis";

// Generates a random session ID using Node's crypto
function genRandomID(): string {
  const randomBytes = crypto.randomBytes(8);
  return Buffer.from(randomBytes).toString("hex");
}

export type RedisSessionArguments = {
  appName: string;
  /** Optional tenant identifier for multi-tenant isolation */
  tenantId?: string;
  cookie: SessionIdStorageStrategy["cookie"];
  options: {
    redisConfig?: RedisOptions;
    /** 
     * A pre-configured ioredis client instance.
     */
    redisClient?: Redis;
  };
};

export function createRedisSessionStorage({
  appName,
  tenantId,
  cookie,
  options,
}: RedisSessionArguments): SessionStorage {
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

  // For Node we are always using the Node version of createCookie
  const createSessionStorage = createSessionStorageFactory(createCookie);

  return createSessionStorage({
    cookie,
    async createData(data, expires) {
      const id = genRandomID();
      const key = formatKey(appName, id, tenantId);
      if (expires) {
        // Use ioredis syntax: SET key value EX seconds
        await redis.set(
          key,
          JSON.stringify(data),
          'EX',
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
        // Use ioredis syntax: SET key value EX seconds
        await redis.set(
          id,
          JSON.stringify(data),
          'EX',
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