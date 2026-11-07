import { ForexService } from '../modules/forex/forex.service';
import { logger } from '../config/logger';
const forex = new ForexService();
export function startForexJob() {
  const run = async () => { try { await forex.refresh(); } catch (e) { logger.error({ err: e }, 'Forex refresh failed'); } };
  void run();
  const timer = setInterval(run, 60 * 60 * 1000);
  timer.unref();
}
