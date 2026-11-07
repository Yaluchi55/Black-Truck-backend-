import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { prisma } from '../db/prisma';
import { env } from '../config/env';
import { HttpError } from './errors';
import { logger } from '../config/logger';
const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export async function deviceAudit(req: Request, _res: Response, next: NextFunction) {
  try {
    const rawDevice = req.header('x-device-id');
    if (!rawDevice || rawDevice.length < 8 || rawDevice.length > 256) throw new HttpError(400, 'A valid X-Device-Id header is required', 'DEVICE_ID_REQUIRED');
    const deviceHash = hash(rawDevice);
    // Hash network address; never store raw IP. Behind a proxy, configure Express trust proxy only for trusted proxy hops.
    const networkHash = req.ip ? hash(req.ip) : undefined;
    req.device = { deviceHash, networkHash };
    const sameDevice = req.auth ? await prisma.deviceEvent.findFirst({
      where: { deviceHash, userId: { not: req.auth.userId }, createdAt: { gte: new Date(Date.now() - 24*60*60*1000) } }
    }) : null;
    const flagged = Boolean(sameDevice);
    await prisma.deviceEvent.create({ data: {
      userId: req.auth?.userId, deviceHash, networkHash, eventType: 'API_REQUEST',
      flagged, metadata: { path: req.path, method: req.method }
    }});
    if (flagged) logger.warn({ path: req.path }, 'Device fingerprint reused across users');
    if (flagged && env.DEVICE_NETWORK_SAME_NODE_BLOCK === 'true') throw new HttpError(403, 'Device risk review required', 'DEVICE_RISK');
    next();
  } catch (e) { next(e); }
}
export async function assertNoCrossRoleDevice(deviceHash: string, riderId: string, driverUserId: string) {
  const rider = await prisma.deviceEvent.findFirst({ where: { userId: riderId, deviceHash, createdAt: { gte: new Date(Date.now()-24*3600*1000) } } });
  const driver = await prisma.deviceEvent.findFirst({ where: { userId: driverUserId, deviceHash, createdAt: { gte: new Date(Date.now()-24*3600*1000) } } });
  if (rider && driver) throw new HttpError(409, 'Potential collusion detected; transaction requires review', 'FRAUD_REVIEW');
}
