import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { app } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './db/prisma';
import { redis } from './infra/redis';
import { registerMatchingGateway } from './modules/location/matching.gateway';
import { startForexJob } from './jobs/forex.job';
async function main() {
  await prisma.$connect();
  await redis.ping();
  const server = createServer(app);
  const io = new Server(server, { cors: { origin: env.CORS_ORIGINS.split(',').map(x=>x.trim()) }, transports: ['websocket','polling'], maxHttpBufferSize: 1e5 });
  registerMatchingGateway(io);
  startForexJob();
  server.listen(env.PORT, () => logger.info({ port: env.PORT }, 'Black Truck API listening'));
  const shutdown = async () => { server.close(); io.close(); await prisma.$disconnect(); redis.disconnect(); process.exit(0); };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}
main().catch(err => { logger.fatal({ err }, 'Startup failed'); process.exit(1); });
