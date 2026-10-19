import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { HttpError } from '../../lib/http-error.js';

export const publicRouter = Router();

publicRouter.get('/tenants/:tenantId/logo', async (req, res) => {
  const logo = await prisma.tenantLogo.findUnique({ where: { tenantId: req.params.tenantId } });
  if (!logo) throw HttpError.notFound('Logo não encontrado');
  res.setHeader('Content-Type', logo.mimeType);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.send(Buffer.from(logo.data));
});

/** Dados públicos do salão (vitrine/link de agendamento futuro). */
publicRouter.get('/tenants/by-slug/:slug', async (req, res) => {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: req.params.slug },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      phone: true,
      address: true,
      status: true,
      businessHours: { orderBy: { weekday: 'asc' } },
      services: { where: { isActive: true }, select: { id: true, name: true, durationMinutes: true, priceCents: true }, orderBy: { name: 'asc' } },
    },
  });
  if (!tenant || tenant.status !== 'ACTIVE') throw HttpError.notFound('Salão não encontrado');
  const { status: _status, ...publicData } = tenant;
  res.json({ tenant: publicData });
});

publicRouter.get('/plans', async (_req, res) => {
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, slug: true, description: true, priceCents: true, maxProfessionals: true, maxAppointmentsPerMonth: true, whatsappEnabled: true },
  });
  res.json({ plans });
});
