import crypto from 'node:crypto';
import { PaymentMethod, TransactionStatus, BookingStatus, PayoutStatus } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { ConfiguredPaymentProvider } from './payment.provider';
import { HttpError } from '../../middleware/errors';
import { env } from '../../config/env';
const provider = new ConfiguredPaymentProvider();
const mobile = /^\+260(?:9[567]\d{7}|7[567]\d{7})$/;
export class PaymentService {
  async initiate(bookingId: string, riderId: string, phoneNumber: string) {
    if (!mobile.test(phoneNumber)) throw new HttpError(400, 'Use a valid Zambian mobile number in +260 format', 'INVALID_PHONE');
    const booking = await prisma.booking.findFirst({ where: { id: bookingId, riderId, status: BookingStatus.PENDING } });
    if (!booking) throw new HttpError(404, 'Pending booking not found', 'BOOKING_NOT_FOUND');
    const reference = `BT-${crypto.randomUUID()}`;
    const tx = await prisma.transaction.create({ data: { bookingId, internalReference: reference, paymentGateway: process.env.PAYMENT_PROVIDER ?? 'mock', amountZmw: booking.basePriceZmw, status: TransactionStatus.PENDING } });
    try {
      const result = await provider.collect({ reference, amount: Number(booking.basePriceZmw), currency: 'ZMW', phoneNumber, description: `Black Truck booking ${booking.id}` });
      return { transactionId: tx.id, reference, providerReference: result.providerReference, status: result.status, message: 'Approve the payment prompt on your mobile device.' };
    } catch (e) {
      await prisma.transaction.update({ where: { id: tx.id }, data: { status: TransactionStatus.FAILED } });
      throw e;
    }
  }
  async processWebhook(rawBody: string, signature: string | undefined, event: any) {
    if (!provider.verifyWebhook(rawBody, signature)) throw new HttpError(401, 'Invalid webhook signature', 'WEBHOOK_SIGNATURE_INVALID');
    const reference = String(event?.reference ?? '');
    const providerId = String(event?.transactionId ?? '');
    const status = String(event?.status ?? '').toUpperCase();
    const eventId = String(event?.eventId ?? '');
    if (!reference || !providerId || !eventId || !['SUCCESS','FAILED'].includes(status)) throw new HttpError(400, 'Invalid payment event payload', 'INVALID_WEBHOOK');
    const tx = await prisma.transaction.findUnique({ where: { internalReference: reference }, include: { booking: { include: { driver: true } } } });
    if (!tx) throw new HttpError(404, 'Transaction not found', 'TRANSACTION_NOT_FOUND');
    if (tx.webhookEventId === eventId || tx.status !== TransactionStatus.PENDING) return { received: true, duplicate: true };
    if (Number(event.amount) !== Number(tx.amountZmw) || event.currency !== 'ZMW') throw new HttpError(409, 'Payment amount or currency mismatch', 'PAYMENT_MISMATCH');
    if (status === 'FAILED') {
      await prisma.transaction.update({ where: { id: tx.id }, data: { status: TransactionStatus.FAILED, telcoTransactionId: providerId, webhookEventId: eventId } });
      return { received: true, status: 'FAILED' };
    }
    if (!tx.booking.driverId || !tx.booking.driver) throw new HttpError(409, 'Booking must have a driver assigned before payment settlement', 'DRIVER_NOT_ASSIGNED');
    const amount = Number(tx.amountZmw);
    const fee = Number((amount * 0.15).toFixed(2));
    const operatorAmount = Number((amount - fee).toFixed(2));
    const eligibleAt = new Date(Date.now() + env.ESCROW_HOLD_HOURS * 3600 * 1000);
    await prisma.$transaction(async db => {
      await db.transaction.update({ where: { id: tx.id }, data: { status: TransactionStatus.SUCCESS, telcoTransactionId: providerId, webhookEventId: eventId, paidAt: new Date(), platformFeeZmw: fee, operatorAmountZmw: operatorAmount } });
      await db.booking.update({ where: { id: tx.bookingId }, data: { status: BookingStatus.ACCEPTED } });
      await db.payout.create({ data: { transactionId: tx.id, driverId: tx.booking.driverId!, amountZmw: operatorAmount, eligibleAt, status: amount > 2000 ? PayoutStatus.HELD : PayoutStatus.QUEUED } });
    });
    // Receipt generation/email and real payout dispatch belong in separately retried workers after durable DB commit.
    return { received: true, status: 'SUCCESS', platformFeeZmw: fee, operatorAmountZmw: operatorAmount, payoutEligibleAt: eligibleAt.toISOString() };
  }
}
