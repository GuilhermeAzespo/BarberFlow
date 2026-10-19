import type { LogLevel, Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { logger } from './logger.js';

interface SystemLogInput {
  tenantId?: string | null;
  level?: LogLevel;
  source: string;
  message: string;
  meta?: Record<string, unknown>;
}

/**
 * Persiste eventos relevantes para o painel de suporte do Super Admin
 * (além de enviar para o stdout estruturado). Nunca lança erro.
 */
export async function systemLog({ tenantId, level = 'INFO', source, message, meta }: SystemLogInput): Promise<void> {
  const pinoLevel = level.toLowerCase() as 'debug' | 'info' | 'warn' | 'error';
  logger[pinoLevel]({ tenantId, source, ...meta }, message);
  try {
    await prisma.systemLog.create({
      data: {
        tenantId: tenantId ?? null,
        level,
        source,
        message: message.slice(0, 2000),
        meta: (meta ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Falha ao persistir SystemLog');
  }
}
