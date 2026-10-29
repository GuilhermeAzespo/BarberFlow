import { Router } from 'express';
import { z } from 'zod';
import { DateTime } from 'luxon';
import type { Prisma, AppointmentStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { assertPlanFeature } from '../../lib/tenant-access.js';

export const reportsRouter = Router();

// Validação de acesso por plano (Pro e Premium)
reportsRouter.use(async (req, res, next) => {
  const tenantId = req.tenantId;
  if (!tenantId) return next();
  try {
    await assertPlanFeature(tenantId, 'reports', 'Central de Relatórios & Inteligência');
    next();
  } catch (err) {
    next(err);
  }
});

const dateRangeSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  professionalId: z.string().optional(),
});

const satisfactionQuerySchema = dateRangeSchema.extend({
  type: z.enum(['ALL', 'ATTENDANT', 'SERVICE']).default('ALL'),
  rating: z.coerce.number().int().min(1).max(5).optional(),
});

const appointmentsQuerySchema = dateRangeSchema.extend({
  status: z.enum(['ALL', 'SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELED', 'NO_SHOW']).default('ALL'),
});

function resolveDateRange(timezone: string, startDate?: string, endDate?: string) {
  const now = DateTime.now().setZone(timezone || 'America/Sao_Paulo');
  let start: Date;
  let end: Date;

  if (startDate) {
    start = DateTime.fromISO(startDate, { zone: timezone }).startOf('day').toJSDate();
  } else {
    // Padrão: início do mês atual
    start = now.startOf('month').toJSDate();
  }

  if (endDate) {
    end = DateTime.fromISO(endDate, { zone: timezone }).endOf('day').toJSDate();
  } else {
    // Padrão: fim do dia atual
    end = now.endOf('day').toJSDate();
  }

  return { start, end };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Relatório de Pesquisas de Satisfação (NPS & Avaliações)
// ─────────────────────────────────────────────────────────────────────────────
reportsRouter.get('/satisfaction', async (req, res) => {
  const tenantId = req.tenantId!;
  const query = satisfactionQuerySchema.parse(req.query);

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { timezone: true },
  });

  const { start, end } = resolveDateRange(tenant.timezone, query.startDate, query.endDate);

  const baseWhere: Prisma.SatisfactionSurveyWhereInput = {
    tenantId,
    createdAt: { gte: start, lte: end },
    ...(query.professionalId ? { professionalId: query.professionalId } : {}),
  };

  const filteredWhere: Prisma.SatisfactionSurveyWhereInput = {
    ...baseWhere,
    ...(query.type !== 'ALL' ? { type: query.type } : {}),
    ...(query.rating ? { rating: query.rating } : {}),
  };

  const [allSurveysInPeriod, filteredSurveys] = await Promise.all([
    prisma.satisfactionSurvey.findMany({
      where: baseWhere,
      select: {
        id: true,
        type: true,
        rating: true,
        feedback: true,
        professionalId: true,
      },
    }),
    prisma.satisfactionSurvey.findMany({
      where: filteredWhere,
      include: {
        professional: { select: { id: true, name: true, avatarUrl: true } },
        appointment: { select: { id: true, service: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);

  // Contagens e Médias Gerais do período
  const totalCount = allSurveysInPeriod.length;
  const ratingCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let ratingSum = 0;
  let feedbackCount = 0;
  let attendantCount = 0;
  let attendantSum = 0;
  let serviceCount = 0;
  let serviceSum = 0;

  for (const s of allSurveysInPeriod) {
    ratingCounts[s.rating] = (ratingCounts[s.rating] || 0) + 1;
    ratingSum += s.rating;
    if (s.feedback && s.feedback.trim().length > 0) {
      feedbackCount++;
    }
    if (s.type === 'ATTENDANT') {
      attendantCount++;
      attendantSum += s.rating;
    } else if (s.type === 'SERVICE') {
      serviceCount++;
      serviceSum += s.rating;
    }
  }

  const averageRating = totalCount > 0 ? Number((ratingSum / totalCount).toFixed(1)) : 0;
  const csatPositiveCount = (ratingCounts[4] || 0) + (ratingCounts[5] || 0);
  const csatPercentage = totalCount > 0 ? Math.round((csatPositiveCount / totalCount) * 100) : 0;

  // NPS Simplificado: Promotores (5) menos Detratores (1 e 2)
  const promoters = ratingCounts[5] || 0;
  const detractors = (ratingCounts[1] || 0) + (ratingCounts[2] || 0);
  const npsScore = totalCount > 0 ? Math.round(((promoters - detractors) / totalCount) * 100) : 0;

  // Agrupamento por Profissional
  const profMap = new Map<string, { total: number; sum: number; fiveStars: number }>();
  for (const s of allSurveysInPeriod) {
    if (s.professionalId) {
      const cur = profMap.get(s.professionalId) || { total: 0, sum: 0, fiveStars: 0 };
      cur.total++;
      cur.sum += s.rating;
      if (s.rating === 5) cur.fiveStars++;
      profMap.set(s.professionalId, cur);
    }
  }

  const professionals = await prisma.professional.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true, avatarUrl: true },
  });

  const professionalRatings = professionals
    .map((p) => {
      const stats = profMap.get(p.id) || { total: 0, sum: 0, fiveStars: 0 };
      const avg = stats.total > 0 ? Number((stats.sum / stats.total).toFixed(1)) : 0;
      return {
        id: p.id,
        name: p.name,
        avatarUrl: p.avatarUrl,
        totalSurveys: stats.total,
        averageRating: avg,
        fiveStarCount: stats.fiveStars,
      };
    })
    .sort((a, b) => b.averageRating - a.averageRating || b.totalSurveys - a.totalSurveys);

  res.json({
    period: { start, end },
    summary: {
      totalSurveys: totalCount,
      averageRating,
      csatPercentage,
      npsScore,
      feedbackCount,
      ratingCounts,
      attendant: {
        total: attendantCount,
        averageRating: attendantCount > 0 ? Number((attendantSum / attendantCount).toFixed(1)) : 0,
      },
      service: {
        total: serviceCount,
        averageRating: serviceCount > 0 ? Number((serviceSum / serviceCount).toFixed(1)) : 0,
      },
    },
    professionalRatings,
    feedbacks: filteredSurveys.map((s) => ({
      id: s.id,
      type: s.type,
      rating: s.rating,
      feedback: s.feedback,
      customerName: s.customerName || 'Cliente',
      customerPhone: s.customerPhone,
      professionalName: s.professional?.name || null,
      serviceName: s.appointment?.service?.name || null,
      createdAt: s.createdAt,
    })),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Relatório de Quantidade de Cortes por Barbeiro (Produtividade & Receita)
// ─────────────────────────────────────────────────────────────────────────────
reportsRouter.get('/cuts-by-barber', async (req, res) => {
  const tenantId = req.tenantId!;
  const query = dateRangeSchema.parse(req.query);

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { timezone: true },
  });

  const { start, end } = resolveDateRange(tenant.timezone, query.startDate, query.endDate);

  const whereAppointments: Prisma.AppointmentWhereInput = {
    tenantId,
    status: 'COMPLETED',
    startAt: { gte: start, lte: end },
    ...(query.professionalId ? { professionalId: query.professionalId } : {}),
  };

  const [completedAppointments, professionals, satisfactionSurveys] = await Promise.all([
    prisma.appointment.findMany({
      where: whereAppointments,
      include: {
        professional: { select: { id: true, name: true, avatarUrl: true } },
        service: { select: { id: true, name: true } },
      },
      orderBy: { startAt: 'desc' },
    }),
    prisma.professional.findMany({
      where: { tenantId, ...(query.professionalId ? { id: query.professionalId } : { isActive: true }) },
      select: { id: true, name: true, avatarUrl: true, color: true },
    }),
    prisma.satisfactionSurvey.findMany({
      where: {
        tenantId,
        type: 'SERVICE',
        createdAt: { gte: start, lte: end },
      },
      select: { professionalId: true, rating: true },
    }),
  ]);

  const totalSalonCuts = completedAppointments.length;
  let totalSalonRevenueCents = 0;

  // Mapeamento de avaliações por profissional
  const ratingMap = new Map<string, { total: number; sum: number }>();
  for (const s of satisfactionSurveys) {
    if (s.professionalId) {
      const cur = ratingMap.get(s.professionalId) || { total: 0, sum: 0 };
      cur.total++;
      cur.sum += s.rating;
      ratingMap.set(s.professionalId, cur);
    }
  }

  // Estatísticas por barbeiro
  const statsMap = new Map<
    string,
    {
      cutsCount: number;
      revenueCents: number;
      servicesMap: Map<string, { name: string; count: number; revenueCents: number }>;
    }
  >();

  for (const p of professionals) {
    statsMap.set(p.id, {
      cutsCount: 0,
      revenueCents: 0,
      servicesMap: new Map(),
    });
  }

  for (const app of completedAppointments) {
    totalSalonRevenueCents += app.priceCents;
    const cur = statsMap.get(app.professionalId);
    if (cur) {
      cur.cutsCount++;
      cur.revenueCents += app.priceCents;
      if (app.service) {
        const srvCur = cur.servicesMap.get(app.service.id) || {
          name: app.service.name,
          count: 0,
          revenueCents: 0,
        };
        srvCur.count++;
        srvCur.revenueCents += app.priceCents;
        cur.servicesMap.set(app.service.id, srvCur);
      }
    }
  }

  const salonAverageTicketCents = totalSalonCuts > 0 ? Math.round(totalSalonRevenueCents / totalSalonCuts) : 0;

  const barbersRanking = professionals
    .map((p) => {
      const st = statsMap.get(p.id) || { cutsCount: 0, revenueCents: 0, servicesMap: new Map() };
      const avgTicket = st.cutsCount > 0 ? Math.round(st.revenueCents / st.cutsCount) : 0;
      const share = totalSalonCuts > 0 ? Math.round((st.cutsCount / totalSalonCuts) * 100) : 0;

      const rStats = ratingMap.get(p.id);
      const avgRating = rStats && rStats.total > 0 ? Number((rStats.sum / rStats.total).toFixed(1)) : null;

      const topServices = Array.from(st.servicesMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return {
        id: p.id,
        name: p.name,
        avatarUrl: p.avatarUrl,
        colorHex: p.color,
        completedCuts: st.cutsCount,
        revenueCents: st.revenueCents,
        averageTicketCents: avgTicket,
        sharePercentage: share,
        averageRating: avgRating,
        topServices,
      };
    })
    .sort((a, b) => b.completedCuts - a.completedCuts || b.revenueCents - a.revenueCents);

  const topBarber = barbersRanking[0] && barbersRanking[0].completedCuts > 0 ? barbersRanking[0] : null;

  res.json({
    period: { start, end },
    summary: {
      totalSalonCuts,
      totalSalonRevenueCents,
      salonAverageTicketCents,
      activeBarbersCount: professionals.length,
      topBarberName: topBarber?.name || 'Nenhum corte registrado',
      topBarberCuts: topBarber?.completedCuts || 0,
    },
    barbers: barbersRanking,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Relatório de Agendamentos (Cancelamentos, Realizados e Agendados)
// ─────────────────────────────────────────────────────────────────────────────
reportsRouter.get('/appointments', async (req, res) => {
  const tenantId = req.tenantId!;
  const query = appointmentsQuerySchema.parse(req.query);

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { timezone: true },
  });

  const { start, end } = resolveDateRange(tenant.timezone, query.startDate, query.endDate);

  const baseWhere: Prisma.AppointmentWhereInput = {
    tenantId,
    startAt: { gte: start, lte: end },
    ...(query.professionalId ? { professionalId: query.professionalId } : {}),
  };

  const filteredWhere: Prisma.AppointmentWhereInput = {
    ...baseWhere,
    ...(query.status !== 'ALL' ? { status: query.status as AppointmentStatus } : {}),
  };

  const [allAppointmentsInPeriod, filteredAppointments] = await Promise.all([
    prisma.appointment.findMany({
      where: baseWhere,
      select: {
        id: true,
        status: true,
        priceCents: true,
        source: true,
        cancelReason: true,
        startAt: true,
      },
    }),
    prisma.appointment.findMany({
      where: filteredWhere,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        professional: { select: { id: true, name: true, avatarUrl: true } },
        service: { select: { id: true, name: true } },
      },
      orderBy: { startAt: 'desc' },
      take: 100,
    }),
  ]);

  const total = allAppointmentsInPeriod.length;
  let completedCount = 0;
  let scheduledCount = 0;
  let canceledCount = 0;
  let noShowCount = 0;

  let realizedRevenueCents = 0;
  let lostRevenueCents = 0;

  const sourceCounts: Record<string, number> = {
    WHATSAPP_BOT: 0,
    PANEL: 0,
    ONLINE_BOOKING: 0,
  };

  const cancelReasonsMap = new Map<string, number>();

  // Agrupamento por dia (timeline)
  const dailyMap = new Map<
    string,
    { date: string; total: number; completed: number; canceled: number; scheduled: number }
  >();

  for (const app of allAppointmentsInPeriod) {
    const dayKey = DateTime.fromJSDate(app.startAt, { zone: tenant.timezone }).toFormat('yyyy-MM-dd');
    const dayCur = dailyMap.get(dayKey) || {
      date: dayKey,
      total: 0,
      completed: 0,
      canceled: 0,
      scheduled: 0,
    };
    dayCur.total++;

    if (app.source && sourceCounts[app.source] !== undefined) {
      sourceCounts[app.source]++;
    }

    if (app.status === 'COMPLETED') {
      completedCount++;
      realizedRevenueCents += app.priceCents;
      dayCur.completed++;
    } else if (app.status === 'SCHEDULED' || app.status === 'CONFIRMED') {
      scheduledCount++;
      dayCur.scheduled++;
    } else if (app.status === 'CANCELED') {
      canceledCount++;
      lostRevenueCents += app.priceCents;
      dayCur.canceled++;
      if (app.cancelReason) {
        cancelReasonsMap.set(app.cancelReason, (cancelReasonsMap.get(app.cancelReason) || 0) + 1);
      }
    } else if (app.status === 'NO_SHOW') {
      noShowCount++;
      lostRevenueCents += app.priceCents;
    }

    dailyMap.set(dayKey, dayCur);
  }

  const completionRate = total > 0 ? Math.round((completedCount / total) * 100) : 0;
  const cancellationRate = total > 0 ? Math.round((canceledCount / total) * 100) : 0;
  const noShowRate = total > 0 ? Math.round((noShowCount / total) * 100) : 0;

  const timeline = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  const topCancellationReasons = Array.from(cancelReasonsMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  res.json({
    period: { start, end },
    summary: {
      totalAppointments: total,
      completedCount,
      scheduledCount,
      canceledCount,
      noShowCount,
      completionRate,
      cancellationRate,
      noShowRate,
      realizedRevenueCents,
      lostRevenueCents,
      sourceCounts,
    },
    topCancellationReasons,
    timeline,
    appointments: filteredAppointments.map((a) => ({
      id: a.id,
      startAt: a.startAt,
      status: a.status,
      source: a.source,
      priceCents: a.priceCents,
      customerName: a.customer.name,
      customerPhone: a.customer.phone,
      professionalName: a.professional.name,
      serviceName: a.service.name,
      cancelReason: a.cancelReason,
    })),
  });
});
