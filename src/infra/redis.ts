import Redis from 'ioredis';
import { env } from '../config/env';
export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3, enableReadyCheck: true });
redis.on('error', (e) => console.error('Redis connection error', e.message));
