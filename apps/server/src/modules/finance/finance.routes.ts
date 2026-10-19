import { Router } from 'express';
import { z } from 'zod';
import type { PaymentMethod, Prisma, TransactionType } from '@prisma/client';
import { DateTime } from 'luxon';
import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from '../../lib/defaults.js';

export const financeRouter = Router();

const transactionSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  category: z.string().trim().min(1, 'Informe a categoria'),
  description: z.string().trim().max(255).nullable().optional(),
  amountCents: z.number().int().positive('O valor deve ser maior que zero'),
  paymentMethod: z.enum(['CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'TRANSFER', 'OTHER']).default('CASH'),
  occurredAt: z.coerce.date().default(() => new Date()),
});

const reportQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(['INCOME', 'EXPENSE']).optional(),
  category: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// Listagem paginada de lançamentos
financeRouter.get('/transactions', async (req, res) => {
  const query = listQuerySchema.parse(req.query);
  const tenantId = req.tenantId!;

  const where: Prisma.TransactionWhereInput = {
    tenantId,
    ...(query.type ? { type: query.type } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.startDate || query.endDate
      ? {
          occurredAt: {
            ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
            ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
          },
        }
      : {}),
  };

  const [total, transactions] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        appointment: {
          select: {
            id: true,
            customer: { select: { name: true } },
            service: { select: { name: true } },
          },
        },
        createdBy: {
          select: { id: true, name: true },
        },
      },
    }),
  ]);

  res.json({
    transactions,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(total / query.pageSize),
  });
});

// Relatório financeiro e métricas de performance
financeRouter.get('/report', async (req, res) => {
  const query = reportQuerySchema.parse(req.query);
  const tenantId = req.tenantId!;

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { timezone: true },
  });

  const now = DateTime.now().setZone(tenant.timezone);
  const start = query.startDate
    ? DateTime.fromISO(query.startDate, { zone: tenant.timezone }).startOf('day')
    : now.startOf('month');
  const end = query.endDate
    ? DateTime.fromISO(query.endDate, { zone: tenant.timezone }).endOf('day')
    : now.endOf('day');

  const where: Prisma.TransactionWhereInput = {
    tenantId,
    occurredAt: {
      gte: start.toJSDate(),
      lte: end.toJSDate(),
    },
  };

  const transactions = await prisma.transaction.findMany({
    where,
    select: {
      id: true,
      type: true,
      category: true,
      amountCents: true,
      paymentMethod: true,
      occurredAt: true,
    },
  });

  let totalIncomeCents = 0;
  let totalExpenseCents = 0;

  const byPaymentMethod: Record<PaymentMethod, number> = {
    CASH: 0,
    PIX: 0,
    CREDIT_CARD: 0,
    DEBIT_CARD: 0,
    TRANSFER: 0,
    OTHER: 0,
  };

  const byCategory: Record<string, { income: number; expense: number }> = {};

  for (const t of transactions) {
    if (t.type === 'INCOME') {
      totalIncomeCents += t.amountCents;
      byPaymentMethod[t.paymentMethod] = (byPaymentMethod[t.paymentMethod] || 0) + t.amountCents;
    } else {
      totalExpenseCents += t.amountCents;
    }

    if (!byCategory[t.category]) {
      byCategory[t.category] = { income: 0, expense: 0 };
    }
    if (t.type === 'INCOME') {
      byCategory[t.category].income += t.amountCents;
    } else {
      byCategory[t.category].expense += t.amountCents;
    }
  }

  const netCents = totalIncomeCents - totalExpenseCents;

  res.json({
    period: {
      startDate: start.toISODate(),
      endDate: end.toISODate(),
    },
    summary: {
      totalIncomeCents,
      totalExpenseCents,
      netCents,
      profitMarginPercent: totalIncomeCents > 0 ? Math.round((netCents / totalIncomeCents) * 100) : 0,
      transactionCount: transactions.length,
    },
    byPaymentMethod,
    byCategory,
  });
});

// Categorias padrão sugeridas
financeRouter.get('/categories', async (_req, res) => {
  res.json({
    income: DEFAULT_INCOME_CATEGORIES,
    expense: DEFAULT_EXPENSE_CATEGORIES,
  });
});

// Criar lançamento avulso (receita ou despesa)
financeRouter.post('/transactions', async (req, res) => {
  const data = transactionSchema.parse(req.body);
  const tenantId = req.tenantId!;

  const transaction = await prisma.transaction.create({
    data: {
      ...data,
      tenantId,
      createdById: req.auth?.userId,
    },
  });

  res.status(201).json({ transaction });
});

// Excluir lançamento
financeRouter.delete('/transactions/:id', async (req, res) => {
  const tenantId = req.tenantId!;
  const transaction = await prisma.transaction.findFirst({
    where: { id: req.params.id, tenantId },
  });

  if (!transaction) throw HttpError.notFound('Lançamento não encontrado');

  await prisma.transaction.delete({
    where: { id: transaction.id },
  });

  res.status(204).end();
});
