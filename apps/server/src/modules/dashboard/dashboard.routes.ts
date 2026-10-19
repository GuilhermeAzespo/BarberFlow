import { Router } from 'express';
import { DateTime } from 'luxon';
import { prisma } from '../../lib/prisma.js';
import { whatsAppService } from '../whatsapp/whatsapp.service.js';

export const dashboardRouter = Router();

dashboardRouter.get('/', async (req, res) => {
  const tenantId = req.tenantId!;

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { timezone: true, name: true },
  });

  const now = DateTime.now().setZone(tenant.timezone);
  const startOfDay = now.startOf('day').toJSDate();
  const endOfDay = now.endOf('day').toJSDate();
  const startOfMonth = now.startOf('month').toJSDate();
  const endOfMonth = now.endOf('month').toJSDate();

  const [
    todayAppointments,
    todayIncomeSum,
    monthIncomeSum,
    monthAppointmentsCount,
    monthCustomersCount,
    whatsAppConfig,
  ] = await Promise.all([
    // Agendamentos de hoje
    prisma.appointment.findMany({
      where: {
        tenantId,
        startAt: { gte: startOfDay, lte: endOfDay },
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        service: { select: { id: true, name: true, durationMinutes: true, priceCents: true } },
        professional: { select: { id: true, name: true, color: true } },
      },
      orderBy: { startAt: 'asc' },
    }),

    // Faturamento de hoje (soma das transações INCOME de hoje)
    prisma.transaction.aggregate({
      where: {
        tenantId,
        type: 'INCOME',
        occurredAt: { gte: startOfDay, lte: endOfDay },
      },
      _sum: { amountCents: true },
    }),

    // Faturamento do mês
    prisma.transaction.aggregate({
      where: {
        tenantId,
        type: 'INCOME',
        occurredAt: { gte: startOfMonth, lte: endOfMonth },
      },
      _sum: { amountCents: true },
    }),

    // Total de agendamentos no mês
    prisma.appointment.count({
      where: {
        tenantId,
        startAt: { gte: startOfMonth, lte: endOfMonth },
      },
    }),

    // Novos clientes cadastrados no mês
    prisma.customer.count({
      where: {
        tenantId,
        createdAt: { gte: startOfMonth, lte: endOfMonth },
      },
    }),

    // Config do WhatsApp
    prisma.whatsAppConfig.findUnique({
      where: { tenantId },
      select: { status: true, phoneNumber: true, botEnabled: true },
    }),
  ]);

  const conn = whatsAppService.getConnection(tenantId);
  const liveWhatsAppStatus = conn.status !== 'DISCONNECTED' ? conn.status : (whatsAppConfig?.status ?? 'DISCONNECTED');

  const todayCompletedCount = todayAppointments.filter((a) => a.status === 'COMPLETED').length;
  const todayPendingCount = todayAppointments.filter((a) => ['SCHEDULED', 'CONFIRMED'].includes(a.status)).length;
  const todayCanceledCount = todayAppointments.filter((a) => a.status === 'CANCELED').length;

  res.json({
    metrics: {
      todayRevenueCents: todayIncomeSum._sum.amountCents || 0,
      monthRevenueCents: monthIncomeSum._sum.amountCents || 0,
      todayAppointmentsTotal: todayAppointments.length,
      todayCompletedCount,
      todayPendingCount,
      todayCanceledCount,
      monthAppointmentsCount,
      monthCustomersCount,
    },
    todayAppointments,
    whatsApp: {
      status: liveWhatsAppStatus,
      phoneNumber: whatsAppConfig?.phoneNumber || conn.phoneNumber,
      botEnabled: whatsAppConfig?.botEnabled ?? false,
    },
  });
});
