import { Router } from 'express';
import { prisma } from '../../db/prisma';
import { redis } from '../../infra/redis';
export const healthRouter = Router();
healthRouter.get('/', async (_req,res) => {
  try { await prisma.$queryRaw`SELECT 1`; await redis.ping(); res.json({ status: 'ok', database: 'ok', redis: 'ok', timestamp: new Date().toISOString() }); }
  catch { res.status(503).json({ status: 'degraded' }); }
});
