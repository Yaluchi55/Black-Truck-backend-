import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { env } from '../../config/env';
import { HttpError } from '../../middleware/errors';
import { SmsService } from './sms.provider';
const sms = new SmsService();
const phonePattern = /^\+260(?:9[567]\d{7}|7[567]\d{7})$/;
const digest = (phone: string, role: UserRole, code: string) => crypto.createHmac('sha256', env.OTP_PEPPER).update(`${phone}:${role}:${code}`).digest('hex');
export class AuthService {
  async requestOtp(phoneInput: string, role: UserRole) {
    const phone = phoneInput.replace(/[\s()-]/g, '');
    if (!phonePattern.test(phone)) throw new HttpError(400, 'Use a valid Zambian mobile number in +260 format', 'INVALID_PHONE');
    if (role === UserRole.ADMIN) throw new HttpError(400, 'This endpoint does not create administrator sessions', 'INVALID_ROLE');
    const recent = await prisma.otpChallenge.count({ where: { phone, createdAt: { gte: new Date(Date.now()-15*60*1000) } } });
    if (recent >= 3) throw new HttpError(429, 'Too many OTP requests; try again later', 'OTP_RATE_LIMIT');
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    await prisma.otpChallenge.updateMany({ where: { phone, role, consumedAt: null }, data: { consumedAt: new Date() } });
    await prisma.otpChallenge.create({ data: { phone, role, codeHash: digest(phone, role, code), expiresAt: new Date(Date.now()+env.OTP_TTL_SECONDS*1000) } });
    await sms.send(phone, `Your Black Truck verification code is ${code}. It expires shortly. Do not share it.`);
    return { message: 'If the number is eligible, a verification code has been sent.' };
  }
  async verifyOtp(phoneInput: string, role: UserRole, code: string, fullName?: string) {
    const phone = phoneInput.replace(/[\s()-]/g, '');
    if (!phonePattern.test(phone) || !/^\d{6}$/.test(code)) throw new HttpError(400, 'Invalid phone number or OTP format', 'INVALID_OTP');
    const challenge = await prisma.otpChallenge.findFirst({ where: { phone, role, consumedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
    if (!challenge || challenge.attempts >= 5) throw new HttpError(401, 'Invalid or expired verification code', 'OTP_INVALID');
    const valid = crypto.timingSafeEqual(Buffer.from(challenge.codeHash), Buffer.from(digest(phone, role, code)));
    await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 }, ...(valid ? { consumedAt: new Date() } : {}) } });
    if (!valid) throw new HttpError(401, 'Invalid or expired verification code', 'OTP_INVALID');
    let user = await prisma.user.findUnique({ where: { phone } });
    if (user && user.role !== role) throw new HttpError(409, 'Phone is registered under another role', 'ROLE_CONFLICT');
    if (!user) {
      if (!fullName?.trim()) throw new HttpError(400, 'fullName is required for first-time registration', 'NAME_REQUIRED');
      user = await prisma.user.create({ data: { phone, role, fullName: fullName.trim() } });
    }
    if (!user.isActive) throw new HttpError(403, 'Account is disabled', 'ACCOUNT_DISABLED');
    const token = jwt.sign({ role: user.role, phone: user.phone }, env.JWT_SECRET, { subject: user.id, issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE, expiresIn: '15m' });
    return { accessToken: token, tokenType: 'Bearer', expiresIn: 900, user: { id: user.id, phone: user.phone, role: user.role, fullName: user.fullName } };
  }
}
