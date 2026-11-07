import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/errors';
import { requireAuth, restrictTo } from '../../middleware/auth';
import { PaymentService } from './payment.service';
import { UserRole } from '@prisma/client';
const service = new PaymentService();
export const paymentRouter = Router();
paymentRouter.post('/collect', requireAuth, restrictTo(UserRole.RIDER), asyncHandler(async (req,res) => {
  const body = z.object({ bookingId: z.string().uuid(), phoneNumber: z.string().min(8).max(20) }).parse(req.body);
  res.status(202).json(await service.initiate(body.bookingId, req.auth!.userId, body.phoneNumber));
}));
paymentRouter.post('/webhook', asyncHandler(async (req,res) => {
  const raw = (req as any).rawBody as string;
  const signature = req.header('x-payment-signature') ?? undefined;
  res.json(await service.processWebhook(raw, signature, req.body));
}));
