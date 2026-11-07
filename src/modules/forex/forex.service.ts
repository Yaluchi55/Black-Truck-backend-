import axios from 'axios';
import { redis } from '../../infra/redis';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
export class ForexService {
  async refresh() {
    const response = await axios.get(env.FOREX_API_URL, { timeout: 8000 });
    const raw = Number(response.data?.rates?.ZMW);
    if (!Number.isFinite(raw) || raw <= 0) throw new Error('Forex provider returned invalid USD/ZMW rate');
    const buffered = Number((raw * (1 + env.FOREX_BUFFER_PERCENT / 100)).toFixed(6));
    const value = { currencyPair: 'USD_ZMW', rawRate: raw, rate: buffered, bufferPercent: env.FOREX_BUFFER_PERCENT, fetchedAt: new Date().toISOString(), source: 'configured-provider' };
    await redis.set('rate:USD_ZMW', JSON.stringify(value), 'EX', 60 * 60 * 3);
    logger.info({ raw, buffered }, 'Forex rate refreshed');
    return value;
  }
  async current() {
    const cached = await redis.get('rate:USD_ZMW');
    return cached ? JSON.parse(cached) : this.refresh();
  }
}
