import { DateTime } from 'luxon';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { HttpError } from '../../lib/http-error.js';
import { assertPlanFeature } from '../../lib/tenant-access.js';
import { whatsAppService } from '../whatsapp/whatsapp.service.js';
import type { ClubSubscriptionStatus } from '@prisma/client';

export interface CreateClubPlanInput {
  name: string;
  description?: string | null;
  priceCents: number;
  maxUsagesPerMonth?: number | null;
  allowedDaysOfWeek?: number[];
  serviceIds: string[];
}

export interface UpdateClubPlanInput {
  name?: string;
  description?: string | null;
  priceCents?: number;
  maxUsagesPerMonth?: number | null;
  allowedDaysOfWeek?: number[];
  isActive?: boolean;
  serviceIds?: string[];
}

export interface CreateSubscriptionInput {
  customerId: string;
  planId: string;
  cycleDays?: number;
  paymentMethod?: string;
  notes?: string | null;
}

export class ClubService {
  /**
   * Lista todos os planos de assinatura do salão.
   */
  async listPlans(tenantId: string, includeInactive = false) {
    return prisma.clubPlan.findMany({
      where: {
        tenantId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: {
        services: {
          include: {
            service: { select: { id: true, name: true, durationMinutes: true, priceCents: true } },
          },
        },
        _count: {
          select: { subscriptions: { where: { status: 'ACTIVE' } } },
        },
      },
      orderBy: [{ priceCents: 'asc' }],
    });
  }

  /**
   * Cria um novo plano de assinatura no salão.
   */
  async createPlan(tenantId: string, input: CreateClubPlanInput) {
    await assertPlanFeature(tenantId, 'club');

    if (!input.name.trim()) throw HttpError.badRequest('Informe o nome do plano');
    if (input.priceCents <= 0) throw HttpError.badRequest('O valor mensal deve ser maior que zero');
    if (!input.serviceIds || input.serviceIds.length === 0) {
      throw HttpError.badRequest('Selecione pelo menos um serviço incluso no plano');
    }

    return prisma.clubPlan.create({
      data: {
        tenantId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        priceCents: input.priceCents,
        maxUsagesPerMonth: input.maxUsagesPerMonth !== undefined ? input.maxUsagesPerMonth : null,
        allowedDaysOfWeek: input.allowedDaysOfWeek || [],
        services: {
          create: input.serviceIds.map((serviceId) => ({ serviceId })),
        },
      },
      include: {
        services: {
          include: { service: { select: { id: true, name: true } } },
        },
      },
    });
  }

  /**
   * Atualiza um plano de assinatura existente.
   */
  async updatePlan(tenantId: string, planId: string, input: UpdateClubPlanInput) {
    await assertPlanFeature(tenantId, 'club');

    const existing = await prisma.clubPlan.findFirst({
      where: { id: planId, tenantId },
    });
    if (!existing) throw HttpError.notFound('Plano não encontrado');

    return prisma.$transaction(async (tx) => {
      if (input.serviceIds) {
        await tx.clubPlanService.deleteMany({ where: { planId } });
        await tx.clubPlanService.createMany({
          data: input.serviceIds.map((serviceId) => ({ planId, serviceId })),
        });
      }

      return tx.clubPlan.update({
        where: { id: planId },
        data: {
          name: input.name !== undefined ? input.name.trim() : undefined,
          description: input.description !== undefined ? input.description?.trim() || null : undefined,
          priceCents: input.priceCents !== undefined ? input.priceCents : undefined,
          maxUsagesPerMonth: input.maxUsagesPerMonth !== undefined ? input.maxUsagesPerMonth : undefined,
          allowedDaysOfWeek: input.allowedDaysOfWeek !== undefined ? input.allowedDaysOfWeek : undefined,
          isActive: input.isActive !== undefined ? input.isActive : undefined,
        },
        include: {
          services: {
            include: { service: { select: { id: true, name: true } } },
          },
        },
      });
    });
  }

  /**
   * Desativa ou exclui plano do clube.
   */
  async deletePlan(tenantId: string, planId: string) {
    await assertPlanFeature(tenantId, 'club');

    const existing = await prisma.clubPlan.findFirst({
      where: { id: planId, tenantId },
      include: { _count: { select: { subscriptions: true } } },
    });
    if (!existing) throw HttpError.notFound('Plano não encontrado');

    if (existing._count.subscriptions > 0) {
      // Se houver assinantes vinculados, apenas desativa para preservar histórico
      return prisma.clubPlan.update({
        where: { id: planId },
        data: { isActive: false },
      });
    }

    return prisma.clubPlan.delete({ where: { id: planId } });
  }

  /**
   * Obtém métricas e KPIs do Clube de Assinatura.
   */
  async getStats(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    const zone = tenant?.timezone || 'America/Sao_Paulo';
    const nowLuxon = DateTime.now().setZone(zone);
    const in7Days = nowLuxon.plus({ days: 7 }).toJSDate();
    const startOfMonth = nowLuxon.startOf('month').toJSDate();

    const [activeSubs, allPlans, usagesThisMonth, expiringSoonCount] = await Promise.all([
      prisma.customerSubscription.findMany({
        where: { tenantId, status: 'ACTIVE' },
        include: { plan: { select: { priceCents: true } } },
      }),
      prisma.clubPlan.count({ where: { tenantId, isActive: true } }),
      prisma.clubUsage.count({
        where: { tenantId, usedAt: { gte: startOfMonth } },
      }),
      prisma.customerSubscription.count({
        where: {
          tenantId,
          status: 'ACTIVE',
          cycleEndDate: { lte: in7Days, gte: nowLuxon.toJSDate() },
        },
      }),
    ]);

    const activeCount = activeSubs.length;
    const mrrCents = activeSubs.reduce((acc, sub) => acc + (sub.plan?.priceCents || 0), 0);

    return {
      activeSubscribersCount: activeCount,
      monthlyRecurringRevenueCents: mrrCents,
      activePlansCount: allPlans,
      usagesThisMonth,
      expiringSoonCount,
    };
  }

  /**
   * Lista assinantes do clube com paginação e busca.
   */
  async listSubscriptions(
    tenantId: string,
    options: { page?: number; pageSize?: number; search?: string; status?: ClubSubscriptionStatus }
  ) {
    const page = options.page || 1;
    const pageSize = options.pageSize || 20;

    const where: any = {
      tenantId,
      ...(options.status ? { status: options.status } : {}),
      ...(options.search
        ? {
            customer: {
              OR: [
                { name: { contains: options.search, mode: 'insensitive' } },
                { phone: { contains: options.search.replace(/\D/g, '') } },
              ],
            },
          }
        : {}),
    };

    const [total, subscriptions] = await Promise.all([
      prisma.customerSubscription.count({ where }),
      prisma.customerSubscription.findMany({
        where,
        orderBy: [{ status: 'asc' }, { cycleEndDate: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          plan: {
            include: {
              services: {
                include: { service: { select: { id: true, name: true } } },
              },
            },
          },
        },
      }),
    ]);

    return {
      subscriptions,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  /**
   * Cadastra ou ativa a assinatura de um cliente no clube.
   */
  async createSubscription(tenantId: string, input: CreateSubscriptionInput) {
    await assertPlanFeature(tenantId, 'club');

    const [tenant, plan, customer] = await Promise.all([
      prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true, slug: true } }),
      prisma.clubPlan.findFirst({ where: { id: input.planId, tenantId, isActive: true } }),
      prisma.customer.findFirst({ where: { id: input.customerId, tenantId } }),
    ]);

    if (!plan) throw HttpError.notFound('Plano não encontrado ou inativo');
    if (!customer) throw HttpError.notFound('Cliente não encontrado');

    const cycleDays = input.cycleDays || 30;
    const now = new Date();
    const cycleEndDate = DateTime.fromJSDate(now).plus({ days: cycleDays }).toJSDate();

    const subscription = await prisma.customerSubscription.upsert({
      where: {
        tenantId_customerId: { tenantId, customerId: input.customerId },
      },
      update: {
        planId: input.planId,
        status: 'ACTIVE',
        cycleStartDate: now,
        cycleEndDate,
        usagesCount: 0,
        paymentMethod: input.paymentMethod || 'MANUAL',
        lastPaymentAt: now,
        notes: input.notes?.trim() || null,
      },
      create: {
        tenantId,
        customerId: input.customerId,
        planId: input.planId,
        status: 'ACTIVE',
        cycleStartDate: now,
        cycleEndDate,
        usagesCount: 0,
        paymentMethod: input.paymentMethod || 'MANUAL',
        lastPaymentAt: now,
        notes: input.notes?.trim() || null,
      },
      include: {
        customer: true,
        plan: true,
      },
    });

    // Envia mensagem festiva de boas-vindas no WhatsApp se conectado
    try {
      const targetPhone = customer.whatsappJid || customer.phone;
      if (targetPhone) {
        const firstName = customer.name.trim().split(/\s+/)[0] || 'Cliente';
        const formattedPrice = (plan.priceCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const endDateFormatted = DateTime.fromJSDate(cycleEndDate).toFormat('dd/MM/yyyy');
        const limitText = plan.maxUsagesPerMonth ? `${plan.maxUsagesPerMonth} cortes/mês` : 'Cortes Ilimitados';

        const welcomeMsg = `👑 *PARABÉNS, ${firstName.toUpperCase()}!*\n\nVocê agora é membro VIP do *${plan.name}* na *${tenant.name}*!\n\n✨ *Benefícios liberados:* ${limitText}\n📅 *Ciclo válido até:* ${endDateFormatted}\n💳 *Mensalidade:* ${formattedPrice}\n\nAo agendar seus horários, o sistema reconhecerá automaticamente seu plano VIP. Aproveite! ✂️`;
        await whatsAppService.sendMessage(tenantId, targetPhone, welcomeMsg);
      }
    } catch (waErr) {
      logger.warn({ err: waErr, tenantId }, 'Aviso: Notificação WhatsApp de adesão ao clube não pôde ser enviada');
    }

    return subscription;
  }

  /**
   * Renova o ciclo da assinatura (+30 dias e zera contagem de cortes utilizados).
   */
  async renewSubscription(tenantId: string, subscriptionId: string, paymentMethod = 'MANUAL') {
    await assertPlanFeature(tenantId, 'club');

    const sub = await prisma.customerSubscription.findFirst({
      where: { id: subscriptionId, tenantId },
      include: {
        customer: true,
        plan: true,
        tenant: { select: { name: true, slug: true } },
      },
    });
    if (!sub) throw HttpError.notFound('Assinatura não encontrada');

    const now = new Date();
    // Se o ciclo já estava vencido, renova a partir de hoje; se estava ativo, estende a partir da data de término
    const baseDate = sub.cycleEndDate > now ? sub.cycleEndDate : now;
    const newCycleEndDate = DateTime.fromJSDate(baseDate).plus({ days: 30 }).toJSDate();

    const updated = await prisma.customerSubscription.update({
      where: { id: subscriptionId },
      data: {
        status: 'ACTIVE',
        cycleStartDate: now,
        cycleEndDate: newCycleEndDate,
        usagesCount: 0,
        paymentMethod,
        lastPaymentAt: now,
      },
      include: {
        customer: true,
        plan: true,
      },
    });

    // Envia confirmação de renovação no WhatsApp
    try {
      const targetPhone = sub.customer.whatsappJid || sub.customer.phone;
      if (targetPhone) {
        const firstName = sub.customer.name.trim().split(/\s+/)[0] || 'Cliente';
        const formattedDate = DateTime.fromJSDate(newCycleEndDate).toFormat('dd/MM/yyyy');
        const renewalMsg = `✅ *Assinatura Renovada com Sucesso!*\n\nOlá, ${firstName}! Seu plano VIP *${sub.plan.name}* na *${sub.tenant.name}* foi renovado.\n\n📅 *Novo ciclo até:* ${formattedDate}\n✂️ Seus créditos de corte foram resetados e estão prontos para uso!\n\nTe esperamos para renovar o visual!`;
        await whatsAppService.sendMessage(tenantId, targetPhone, renewalMsg);
      }
    } catch (waErr) {
      logger.warn({ err: waErr, tenantId }, 'Aviso: Notificação de renovação não enviada');
    }

    return updated;
  }

  /**
   * Cancela assinatura de um cliente.
   */
  async cancelSubscription(tenantId: string, subscriptionId: string, notes?: string) {
    await assertPlanFeature(tenantId, 'club');

    return prisma.customerSubscription.update({
      where: { id: subscriptionId },
      data: {
        status: 'CANCELED',
        autoRenew: false,
        notes: notes ? notes.trim() : undefined,
      },
    });
  }

  /**
   * Verifica se o cliente possui cobertura do Clube para um serviço e data específicos.
   */
  async checkCustomerClubCoverage(
    tenantId: string,
    customerId: string,
    serviceId: string,
    appointmentDate: Date
  ): Promise<{
    covered: boolean;
    planName?: string;
    subscriptionId?: string;
    usagesCount?: number;
    maxUsages?: number | null;
    reason?: string;
  }> {
    const sub = await prisma.customerSubscription.findUnique({
      where: { tenantId_customerId: { tenantId, customerId } },
      include: {
        plan: {
          include: { services: true },
        },
      },
    });

    if (!sub || sub.status !== 'ACTIVE') {
      return { covered: false, reason: 'Cliente não possui assinatura ativa no clube.' };
    }

    // 1. Valida data do ciclo
    if (appointmentDate > sub.cycleEndDate) {
      return { covered: false, reason: 'Ciclo do plano expirado. Necessário renovar a assinatura.' };
    }

    // 2. Valida dia da semana se restrito
    const apptWeekday = DateTime.fromJSDate(appointmentDate).weekday === 7 ? 0 : DateTime.fromJSDate(appointmentDate).weekday;
    if (sub.plan.allowedDaysOfWeek && sub.plan.allowedDaysOfWeek.length > 0) {
      if (!sub.plan.allowedDaysOfWeek.includes(apptWeekday)) {
        return { covered: false, reason: 'Este plano VIP não é válido para o dia da semana selecionado.' };
      }
    }

    // 3. Valida se o serviço está incluso
    const isServiceCovered = sub.plan.services.some((s) => s.serviceId === serviceId);
    if (!isServiceCovered) {
      return { covered: false, reason: 'Este serviço não está incluso no plano assinado.' };
    }

    // 4. Valida limite de usos
    if (sub.plan.maxUsagesPerMonth !== null && sub.usagesCount >= sub.plan.maxUsagesPerMonth) {
      return {
        covered: false,
        reason: `Limite de ${sub.plan.maxUsagesPerMonth} cortes do ciclo mensal atingido.`,
      };
    }

    return {
      covered: true,
      planName: sub.plan.name,
      subscriptionId: sub.id,
      usagesCount: sub.usagesCount,
      maxUsages: sub.plan.maxUsagesPerMonth,
    };
  }

  /**
   * Hook disparado ao concluir agendamento (COMPLETED) para abater uso do Clube.
   */
  async processClubUsageForCompletedAppointment(tenantId: string, appointmentId: string) {
    try {
      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: {
          customer: true,
          service: true,
          tenant: { select: { id: true, name: true, slug: true } },
        },
      });

      if (!appointment || !appointment.customer) return;

      // Verifica se já registrou uso para este agendamento
      const existingUsage = await prisma.clubUsage.findFirst({
        where: { appointmentId },
      });
      if (existingUsage) return;

      // Checa cobertura
      const coverage = await this.checkCustomerClubCoverage(
        tenantId,
        appointment.customer.id,
        appointment.serviceId,
        appointment.startAt
      );

      if (!coverage.covered || !coverage.subscriptionId) return;

      // Registra uso e incrementa contagem
      await prisma.$transaction(async (tx) => {
        await tx.clubUsage.create({
          data: {
            tenantId,
            subscriptionId: coverage.subscriptionId!,
            appointmentId,
            serviceId: appointment.serviceId,
            notes: `Uso no agendamento do serviço ${appointment.service.name}`,
          },
        });

        await tx.customerSubscription.update({
          where: { id: coverage.subscriptionId },
          data: {
            usagesCount: { increment: 1 },
          },
        });
      });

      // Dispara WhatsApp comemorativo
      const targetPhone = appointment.customer.whatsappJid || appointment.customer.phone;
      if (targetPhone) {
        const nextCount = (coverage.usagesCount || 0) + 1;
        const limitStr = coverage.maxUsages ? `${nextCount}/${coverage.maxUsages} cortes` : `${nextCount} cortes (Ilimitado)`;
        const firstName = appointment.customer.name.trim().split(/\s+/)[0] || 'Cliente';

        const vipUsageMsg = `👑 *Atendimento Concluído com Sucesso!*\n\nOlá, ${firstName}! Seu serviço *${appointment.service.name}* na *${appointment.tenant.name}* foi 100% coberto pelo seu *${coverage.planName}*!\n\n📊 *Seus usos no ciclo atual:* ${limitStr}\n\nObrigado por ser um membro VIP! Volte sempre. ✂️`;
        await whatsAppService.sendMessage(tenantId, targetPhone, vipUsageMsg);
      }

      logger.info(
        { tenantId, appointmentId, customerId: appointment.customer.id, planName: coverage.planName },
        'Uso do Clube de Assinatura computado automaticamente'
      );
    } catch (err) {
      logger.error({ err, tenantId, appointmentId }, 'Erro ao computar uso do Clube de Assinatura');
    }
  }

  /**
   * Lista histórico de utilizações do clube.
   */
  async listUsages(tenantId: string, page = 1, pageSize = 20) {
    const [total, usages] = await Promise.all([
      prisma.clubUsage.count({ where: { tenantId } }),
      prisma.clubUsage.findMany({
        where: { tenantId },
        orderBy: { usedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          subscription: {
            include: {
              customer: { select: { id: true, name: true, phone: true } },
              plan: { select: { id: true, name: true } },
            },
          },
          service: { select: { id: true, name: true } },
          appointment: { select: { id: true, startAt: true } },
        },
      }),
    ]);

    return {
      usages,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  /**
   * Planos públicos para exibição na Vitrine.
   */
  async getPublicPlans(slug: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true, phone: true },
    });
    if (!tenant) throw HttpError.notFound('Barbearia não encontrada');

    const plans = await prisma.clubPlan.findMany({
      where: { tenantId: tenant.id, isActive: true },
      include: {
        services: {
          include: {
            service: { select: { id: true, name: true, durationMinutes: true, priceCents: true } },
          },
        },
      },
      orderBy: { priceCents: 'asc' },
    });

    return {
      tenantName: tenant.name,
      tenantPhone: tenant.phone,
      plans: plans.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        priceCents: p.priceCents,
        maxUsagesPerMonth: p.maxUsagesPerMonth,
        allowedDaysOfWeek: p.allowedDaysOfWeek,
        services: p.services.map((s) => s.service.name),
      })),
    };
  }
}

export const clubService = new ClubService();
