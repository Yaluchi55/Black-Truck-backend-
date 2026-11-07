import axios from 'axios';
import { env } from '../../config/env';
export type CollectInput = { reference: string; amount: number; currency: 'ZMW'; phoneNumber: string; description: string };
export interface PaymentProvider { collect(input: CollectInput): Promise<{ providerReference: string; status: 'PENDING' }>; verifyWebhook(rawBody: string, signature: string | undefined): boolean; }
export class ConfiguredPaymentProvider implements PaymentProvider {
  async collect(input: CollectInput) {
    if (env.PAYMENT_PROVIDER === 'mock') return { providerReference: `mock_${input.reference}`, status: 'PENDING' as const };
    if (!env.PAYMENT_API_URL || !env.PAYMENT_API_KEY) throw new Error('Payment provider is not configured');
    const r = await axios.post(`${env.PAYMENT_API_URL}/collections`, input, { headers: { Authorization: `Bearer ${env.PAYMENT_API_KEY}`, 'Idempotency-Key': input.reference }, timeout: 12000 });
    return { providerReference: String(r.data.reference), status: 'PENDING' as const };
  }
  verifyWebhook(rawBody: string, signature?: string) {
    if (!signature) return false;
    const crypto = require('node:crypto') as typeof import('node:crypto');
    const expected = crypto.createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET).update(rawBody).digest('hex');
    const a = Buffer.from(expected); const b = Buffer.from(signature);
    return a.length === b.length && crypto.timingSafeEqual(a,b);
  }
}
