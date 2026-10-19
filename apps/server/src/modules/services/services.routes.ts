import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { requireRole } from '../../middlewares/auth.js';

export const servicesRouter = Router();

const serviceSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do serviço').max(80),
  description: z.string().trim().max(300).nullable().optional(),
  durationMinutes: z.number().int().min(5, 'Duração mínima de 5 minutos').max(480),
  priceCents: z.number().int().min(0),
  isActive: z.boolean().optional(),
});

servicesRouter.get('/', async (req, res) => {
  const onlyActive = req.query.active === 'true';
  const services = await prisma.service.findMany({
    where: { tenantId: req.tenantId!, ...(onlyActive ? { isActive: true } : {}) },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
  res.json({ services });
});

servicesRouter.post('/', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const data = serviceSchema.parse(req.body);
  const service = await prisma.service.create({ data: { ...data, tenantId: req.tenantId! } });
  res.status(201).json({ service });
});

servicesRouter.patch('/:id', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const id = req.params.id as string;
  const data = serviceSchema.partial().parse(req.body);
  const current = await prisma.service.findFirst({ where: { id, tenantId: req.tenantId! } });
  if (!current) throw HttpError.notFound('Serviço não encontrado');
  const service = await prisma.service.update({ where: { id: current.id }, data });
  res.json({ service });
});

servicesRouter.delete('/:id', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const id = req.params.id as string;
  const current = await prisma.service.findFirst({ where: { id, tenantId: req.tenantId! } });
  if (!current) throw HttpError.notFound('Serviço não encontrado');
  const used = await prisma.appointment.count({ where: { serviceId: current.id } });
  if (used > 0) {
    await prisma.service.update({ where: { id: current.id }, data: { isActive: false } });
    return res.json({ deleted: false, deactivated: true });
  }
  await prisma.service.delete({ where: { id: current.id } });
  res.json({ deleted: true, deactivated: false });
});
