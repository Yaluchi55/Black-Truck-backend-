import { Router } from 'express';
import { z } from 'zod';
import { BookingType, PaymentMethod, UserRole } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { asyncHandler, HttpError } from '../../middleware/errors';
import { requireAuth, restrictTo } from '../../middleware/auth';
export const bookingsRouter = Router();
bookingsRouter.post('/', requireAuth, restrictTo(UserRole.RIDER), asyncHandler(async (req,res) => {
  const b = z.object({
    bookingType: z.enum(['HOURLY','POINT_TO_POINT']),
    totalHours: z.number().positive().max(24).optional(),
    basePriceZmw: z.number().positive().max(1000000),
    basePriceUsd: z.number().positive().optional(),
    paymentMethod: z.enum(['MTN_MOMO','AIRTEL_MONEY','CARD','CASH']),
    expenseMemo: z.string().max(500).optional(),
    pickupLat: z.number().min(-90).max(90), pickupLng: z.number().min(-180).max(180),
    dropoffLat: z.number().min(-90).max(90).optional(), dropoffLng: z.number().min(-180).max(180).optional()
  }).parse(req.body);
  if (b.bookingType === BookingType.HOURLY && !b.totalHours) throw new HttpError(400, 'totalHours is required for hourly bookings', 'HOURS_REQUIRED');
  if (b.bookingType === BookingType.POINT_TO_POINT && (b.dropoffLat === undefined || b.dropoffLng === undefined)) throw new HttpError(400, 'Drop-off coordinates are required', 'DROPOFF_REQUIRED');
  const booking = await prisma.booking.create({ data: {
    riderId: req.auth!.userId, bookingType: b.bookingType, totalHours: b.totalHours,
    basePriceZmw: b.basePriceZmw, basePriceUsd: b.basePriceUsd, paymentMethod: b.paymentMethod as PaymentMethod,
    expenseMemo: b.expenseMemo, pickupLat: b.pickupLat, pickupLng: b.pickupLng, dropoffLat: b.dropoffLat, dropoffLng: b.dropoffLng
  }});
  res.status(201).json({ booking });
}));
bookingsRouter.get('/:id', requireAuth, asyncHandler(async (req,res) => {
  const booking = await prisma.booking.findFirst({ where: { id: req.params.id, OR: [{ riderId: req.auth!.userId }, { driver: { userId: req.auth!.userId } }] }, include: { transactions: true, driver: { include: { user: { select: { fullName: true, phone: true } } } } } });
  if (!booking) throw new HttpError(404, 'Booking not found', 'BOOKING_NOT_FOUND');
  res.json({ booking });
}));
