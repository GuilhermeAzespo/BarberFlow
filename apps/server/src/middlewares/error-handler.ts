import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { HttpError } from '../lib/http-error.js';
import { logger } from '../lib/logger.js';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(HttpError.notFound(`Rota ${req.method} ${req.path} não encontrada`));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details } });
  }

  if (error instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: error.issues[0]?.message ?? 'Dados inválidos',
        details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      },
    });
  }

  if (error instanceof MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'Arquivo muito grande (máx. 2 MB)' : error.message;
    return res.status(400).json({ error: { code: 'UPLOAD_ERROR', message } });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: { code: 'DUPLICATE', message: 'Registro já existe com estes dados' } });
    }
    if (error.code === 'P2025') {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurso não encontrado' } });
    }
    if (error.code === 'P2003') {
      return res.status(409).json({ error: { code: 'IN_USE', message: 'Registro vinculado a outros dados' } });
    }
  }

  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'JSON inválido' } });
  }

  logger.error({ err: error, path: req.path, method: req.method }, 'Erro não tratado');
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno. Tente novamente.' } });
}
