import type { Server, Socket } from 'socket.io';
import { prisma } from '../../db/prisma';
import { LocationService } from './location.service';
import { logger } from '../../config/logger';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
const locationService = new LocationService();
type Claims = { sub: string; role: string };
export function registerMatchingGateway(io: Server) {
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string') return next(new Error('Authentication required'));
      const claims = jwt.verify(token, env.JWT_SECRET, { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }) as jwt.JwtPayload & Claims;
      if (!claims.sub || claims.role !== 'CHAUFFEUR') return next(new Error('Chauffeur role required'));
      socket.data.userId = claims.sub;
      next();
    } catch { next(new Error('Invalid or expired token')); }
  });
  io.on('connection', (socket: Socket) => {
    logger.info({ userId: socket.data.userId }, 'Chauffeur socket connected');
    socket.on('driver:online', async (payload: { online: boolean }) => {
      if (typeof payload?.online !== 'boolean') return;
      const driver = await prisma.driver.findUnique({ where: { userId: socket.data.userId } });
      if (!driver || !driver.rtsaPsvCleared) return socket.emit('driver:error', { code: 'DRIVER_NOT_CLEARED' });
      await prisma.driver.update({ where: { id: driver.id }, data: { isOnline: payload.online } });
      socket.join(`driver:${driver.id}`);
      socket.emit('driver:online:ack', { online: payload.online });
    });
    socket.on('driver:location', async (payload: { lat: number; lng: number }) => {
      try {
        const driver = await prisma.driver.findUnique({ where: { userId: socket.data.userId } });
        if (!driver) return socket.emit('driver:error', { code: 'DRIVER_PROFILE_REQUIRED' });
        await locationService.updateDriverLocation(driver.id, payload);
        socket.emit('driver:location:ack', { accepted: true, at: Date.now() });
      } catch (e) { socket.emit('driver:error', { code: 'LOCATION_REJECTED' }); logger.warn({ err: e }, 'Rejected driver location'); }
    });
    socket.on('disconnect', () => logger.info({ userId: socket.data.userId }, 'Chauffeur socket disconnected'));
  });
}
