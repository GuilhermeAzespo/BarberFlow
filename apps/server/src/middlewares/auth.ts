import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@prisma/client';
import { AUTH_COOKIE, verifyToken } from '../lib/auth-token.js';
import { HttpError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';
import { evaluateTenantAccess, loadTenant } from '../lib/tenant-access.js';

function extractToken(req: Request): string | null {
  const cookieToken = req.cookies?.[AUTH_COOKIE] as string | undefined;
  if (cookieToken) return cookieToken;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

/** Valida o JWT e confirma no banco que o usuário continua ativo. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) throw HttpError.unauthorized();

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw HttpError.unauthorized('Sessão expirada. Faça login novamente.');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, tenantId: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) throw HttpError.unauthorized('Usuário inválido ou desativado');

  req.auth = {
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role,
    impersonatedBy: payload.impersonatedBy ?? null,
  };
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) throw HttpError.unauthorized();
    if (!roles.includes(req.auth.role)) throw HttpError.forbidden('Você não tem permissão para esta ação');
    next();
  };
}

/**
 * Garante contexto de tenant e situação da assinatura.
 * Deve ser usado após `requireAuth` em todas as rotas do painel do salão.
 */
export async function requireTenant(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) throw HttpError.unauthorized();
  if (!req.auth.tenantId) throw HttpError.forbidden('Rota disponível apenas para contas de salão');

  const tenant = await loadTenant(req.auth.tenantId);
  const access = evaluateTenantAccess(tenant);
  if (!access.allowed) throw HttpError.forbidden(access.message, access.code);

  req.tenantId = tenant.id;
  next();
}

export const requireSuperAdmin = [requireAuth, requireRole('SUPER_ADMIN')];
