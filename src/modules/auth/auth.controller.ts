import { Router } from 'express';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';
import { asyncHandler } from '../../middleware/errors';
const service = new AuthService();
export const authRouter = Router();
const phone = z.string().min(8).max(20);
authRouter.post('/otp/request', asyncHandler(async (req,res) => {
  const body = z.object({ phone, role: z.enum(['RIDER','CHAUFFEUR']) }).parse(req.body);
  res.status(202).json(await service.requestOtp(body.phone, body.role as UserRole));
}));
authRouter.post('/otp/verify', asyncHandler(async (req,res) => {
  const body = z.object({ phone, role: z.enum(['RIDER','CHAUFFEUR']), code: z.string().regex(/^\d{6}$/), fullName: z.string().min(2).max(160).optional() }).parse(req.body);
  res.json(await service.verifyOtp(body.phone, body.role as UserRole, body.code, body.fullName));
}));
