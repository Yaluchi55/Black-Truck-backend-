import axios from 'axios';
import { env } from '../../config/env';
export interface SmsProvider { send(phone: string, message: string): Promise<void>; }
export class SmsService implements SmsProvider {
  async send(phone: string, message: string) {
    if (env.OTP_PROVIDER === 'mock') {
      // Development-only; OTP is never returned by the HTTP API. Inspect local server logs only.
      console.info(`[MOCK SMS] destination=${phone} message=${message}`);
      return;
    }
    if (!env.SMS_API_URL || !env.SMS_API_TOKEN) throw new Error('SMS provider is not configured');
    await axios.post(env.SMS_API_URL, { to: phone, message }, { headers: { Authorization: `Bearer ${env.SMS_API_TOKEN}` }, timeout: 8000 });
  }
}
