import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { normalizePhone } from '../../lib/utils.js';

export const customersRouter = Router();

const customerSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome').max(100),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.email().nullable().optional(),
  birthDate: z.coerce.date().nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

const listQuery = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

customersRouter.get('/', async (req, res) => {
  const { search, page, pageSize } = listQuery.parse(req.query);
  const tenantId = req.tenantId!;
  const digits = search?.replace(/\D/g, '');
  const where: Prisma.CustomerWhereInput = {
    tenantId,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            ...(digits ? [{ phone: { contains: digits } }] : []),
          ],
        }
      : {}),
  };
  const [total, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { appointments: true } } },
    }),
  ]);
  res.json({ customers, total, page, pageSize });
});

customersRouter.get('/:id', async (req, res) => {
  const customer = await prisma.customer.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId! },
    include: {
      appointments: {
        orderBy: { startAt: 'desc' },
        take: 30,
        include: { service: { select: { name: true } }, professional: { select: { name: true } } },
      },
    },
  });
  if (!customer) throw HttpError.notFound('Cliente não encontrado');
  const completed = customer.appointments.filter((a) => a.status === 'COMPLETED');
  res.json({
    customer,
    stats: {
      totalAppointments: customer.appointments.length,
      completed: completed.length,
      totalSpentCents: completed.reduce((sum, a) => sum + a.priceCents, 0),
      lastVisit: completed[0]?.startAt ?? null,
    },
  });
});

customersRouter.post('/', async (req, res) => {
  const data = customerSchema.parse(req.body);
  const phone = normalizePhone(data.phone);
  if (phone) {
    const exists = await prisma.customer.findFirst({ where: { tenantId: req.tenantId!, phone } });
    if (exists) throw HttpError.conflict('Já existe um cliente com este telefone', 'PHONE_IN_USE');
  }
  const customer = await prisma.customer.create({ data: { ...data, phone, tenantId: req.tenantId! } });
  res.status(201).json({ customer });
});

customersRouter.patch('/:id', async (req, res) => {
  const data = customerSchema.partial().parse(req.body);
  const current = await prisma.customer.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!current) throw HttpError.notFound('Cliente não encontrado');
  const customer = await prisma.customer.update({
    where: { id: current.id },
    data: { ...data, phone: data.phone === undefined ? undefined : normalizePhone(data.phone) },
  });
  res.json({ customer });
});

customersRouter.delete('/:id', async (req, res) => {
  const current = await prisma.customer.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!current) throw HttpError.notFound('Cliente não encontrado');
  await prisma.customer.delete({ where: { id: current.id } });
  res.status(204).end();
});
