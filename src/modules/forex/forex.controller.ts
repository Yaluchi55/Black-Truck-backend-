import { Router } from 'express';
import { asyncHandler } from '../../middleware/errors';
import { ForexService } from './forex.service';
const service = new ForexService();
export const forexRouter = Router();
forexRouter.get('/usd-zmw', asyncHandler(async (_req,res) => res.json(await service.current())));
