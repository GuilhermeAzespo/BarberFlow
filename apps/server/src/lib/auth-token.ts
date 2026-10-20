import type { CookieOptions } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { UserRole } from '@prisma/client';
import { env } from '../config/env.js';

export const AUTH_COOKIE = 'bf_token';

export interface TokenPayload {
  sub: string;
  tid: string | null;
  role: UserRole;
  impersonatedBy?: string | null;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    issuer: 'barberflow',
  });
}

export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET, { issuer: 'barberflow' });
  if (typeof decoded === 'string' || !decoded.sub) throw new Error('Token inválido');
  return {
    sub: decoded.sub,
    tid: (decoded.tid as string | null) ?? null,
    role: decoded.role as UserRole,
    impersonatedBy: (decoded.impersonatedBy as string | null) ?? null,
  };
}

function parseDurationMs(value: string): number {
  const match = /^(\d+)\s*([smhd])?$/.exec(value.trim());
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const amount = Number(match[1]);
  const unit = match[2] ?? 's';
  const factor = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit] ?? 1000;
  return amount * factor;
}

export function authCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: parseDurationMs(env.JWT_EXPIRES_IN),
  };
}
