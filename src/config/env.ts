import 'dotenv/config';
import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z.enum(['development','test','production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default('black-truck-api'),
  JWT_AUDIENCE: z.string().default('black-truck-mobile'),
  OTP_TTL_SECONDS: z.coerce.number().int().min(60).max(600).default(300),
  OTP_PEPPER: z.string().min(24),
  OTP_PROVIDER: z.enum(['mock','http']).default('mock'),
  SMS_API_URL: z.string().optional().default(''),
  SMS_API_TOKEN: z.string().optional().default(''),
  FOREX_API_URL: z.string().url().default('https://open.er-api.com/v6/latest/USD'),
  FOREX_API_KEY: z.string().optional().default(''),
  FOREX_BUFFER_PERCENT: z.coerce.number().min(0).max(10).default(2),
  PAYMENT_PROVIDER: z.enum(['mock','http']).default('mock'),
  PAYMENT_API_URL: z.string().optional().default(''),
  PAYMENT_API_KEY: z.string().optional().default(''),
  PAYMENT_WEBHOOK_SECRET: z.string().min(16),
  CORS_ORIGINS: z.string().default('http://localhost:8081'),
  LUSAKA_CENTER_LAT: z.coerce.number().default(-15.4167),
  LUSAKA_CENTER_LNG: z.coerce.number().default(28.2833),
  MAX_MATCH_RADIUS_METERS: z.coerce.number().positive().default(15000),
  LOCATION_MAX_AGE_SECONDS: z.coerce.number().positive().default(90),
  ESCROW_HOLD_HOURS: z.coerce.number().min(48).default(48),
  DEVICE_NETWORK_SAME_NODE_BLOCK: z.string().default('false'),
  RECEIPT_FROM_EMAIL: z.string().email().default('receipts@example.com'),
  SMTP_URL: z.string().optional().default('')
});
export const env = schema.parse(process.env);
