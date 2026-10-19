import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { assertProfessionalLimit } from '../../lib/tenant-access.js';
import { normalizePhone } from '../../lib/utils.js';
import { requireRole } from '../../middlewares/auth.js';

export const professionalsRouter = Router();

const professionalSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome').max(80),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.email().nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida').optional(),
  commissionPercent: z.number().int().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
  serviceIds: z.array(z.string()).optional(),
});

const include = { services: { select: { serviceId: true } } } as const;

function serialize(p: Prisma.ProfessionalGetPayload<{ include: typeof include }>) {
  const { services, ...rest } = p;
  return { ...rest, serviceIds: services.map((s) => s.serviceId) };
}

async function assertServicesBelongToTenant(tenantId: string, serviceIds?: string[]) {
  if (!serviceIds?.length) return;
  const count = await prisma.service.count({ where: { tenantId, id: { in: serviceIds } } });
  if (count !== new Set(serviceIds).size) throw HttpError.badRequest('Um ou mais serviços são inválidos');
}

professionalsRouter.get('/', async (req, res) => {
  const onlyActive = req.query.active === 'true';
  const professionals = await prisma.professional.findMany({
    where: { tenantId: req.tenantId!, ...(onlyActive ? { isActive: true } : {}) },
    include,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
  res.json({ professionals: professionals.map(serialize) });
});

professionalsRouter.get('/:id', async (req, res) => {
  const professional = await prisma.professional.findFirst({ where: { id: req.params.id as string, tenantId: req.tenantId! }, include });
  if (!professional) throw HttpError.notFound('Profissional não encontrado');
  res.json({ professional: serialize(professional) });
});

professionalsRouter.post('/', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const tenantId = req.tenantId!;
  const { serviceIds, ...data } = professionalSchema.parse(req.body);
  if (data.isActive !== false) await assertProfessionalLimit(tenantId);
  await assertServicesBelongToTenant(tenantId, serviceIds);

  const professional = await prisma.professional.create({
    data: {
      ...data,
      tenantId,
      phone: normalizePhone(data.phone),
      services: serviceIds?.length ? { createMany: { data: serviceIds.map((serviceId) => ({ serviceId })) } } : undefined,
    },
    include,
  });
  res.status(201).json({ professional: serialize(professional) });
});

professionalsRouter.patch('/:id', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const tenantId = req.tenantId!;
  const id = req.params.id as string;
  const { serviceIds, ...data } = professionalSchema.partial().parse(req.body);
  const current = await prisma.professional.findFirst({ where: { id, tenantId } });
  if (!current) throw HttpError.notFound('Profissional não encontrado');
  if (data.isActive === true && !current.isActive) await assertProfessionalLimit(tenantId);
  await assertServicesBelongToTenant(tenantId, serviceIds);

  const professional = await prisma.$transaction(async (tx) => {
    if (serviceIds) {
      await tx.professionalService.deleteMany({ where: { professionalId: current.id } });
      if (serviceIds.length) {
        await tx.professionalService.createMany({ data: serviceIds.map((serviceId) => ({ professionalId: current.id, serviceId })) });
      }
    }
    return tx.professional.update({
      where: { id: current.id },
      data: { ...data, phone: data.phone === undefined ? undefined : normalizePhone(data.phone) },
      include,
    });
  });
  res.json({ professional: serialize(professional) });
});

/** Remove se não houver histórico; caso contrário apenas desativa (preserva relatórios). */
professionalsRouter.delete('/:id', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const tenantId = req.tenantId!;
  const id = req.params.id as string;
  const current = await prisma.professional.findFirst({ where: { id, tenantId } });
  if (!current) throw HttpError.notFound('Profissional não encontrado');
  const appointments = await prisma.appointment.count({ where: { professionalId: current.id } });
  if (appointments > 0) {
    await prisma.professional.update({ where: { id: current.id }, data: { isActive: false } });
    return res.json({ deleted: false, deactivated: true });
  }
  await prisma.professional.delete({ where: { id: current.id } });
  res.json({ deleted: true, deactivated: false });
});
