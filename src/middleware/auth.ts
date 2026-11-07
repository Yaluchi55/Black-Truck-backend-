import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { env } from '../config/env';
import { HttpError } from './errors';
type Claims = { sub: string; role: UserRole; phone: string; iss: string; aud: string };
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'Bearer token required', 'AUTH_REQUIRED');
    const claims = jwt.verify(header.slice(7), env.JWT_SECRET, { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE }) as jwt.JwtPayload & Claims;
    if (!claims.sub || !Object.values(UserRole).includes(claims.role)) throw new HttpError(401, 'Invalid token claims', 'INVALID_TOKEN');
    req.auth = { userId: claims.sub, role: claims.role, phone: claims.phone };
    next();
  } catch (e) { next(e instanceof HttpError ? e : new HttpError(401, 'Invalid or expired token', 'INVALID_TOKEN')); }
}
export function restrictTo(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(new HttpError(401, 'Authentication required', 'AUTH_REQUIRED'));
    if (!roles.includes(req.auth.role)) return next(new HttpError(403, 'Insufficient permissions', 'FORBIDDEN'));
    next();
  };
}
