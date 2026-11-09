import crypto from 'node:crypto';
import { DateTime } from 'luxon';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { HttpError } from '../../lib/http-error.js';
import { assertPlanFeature, hasPlanFeature } from '../../lib/tenant-access.js';
import { whatsAppService } from '../whatsapp/whatsapp.service.js';
import type { ClubSubscriptionStatus } from '@prisma/client';

export interface CreateClubPlanInput {
  name: string;
  description?: string | null;
  priceCents: number;
  maxUsagesPerMonth?: number | null;
  allowedDaysOfWeek?: number[];
  serviceIds: string[];
  isActive?: boolean;
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
  autoRenew?: boolean;
  notes?: string | null;
}

export type ClubDunningStage = 'D-3' | 'D0' | 'D+2';

export interface ClubBotWarningResult {
  checkedCount: number;
  messagesSent: number;
  autoRenewedCount: number;
  expiredCount: number;
  details: Array<{
    subscriptionId: string;
    customerName: string;
    planName: string;
    stage: ClubDunningStage;
    autoRenew: boolean;
    sent: boolean;
  }>;
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
        isActive: input.isActive !== undefined ? input.isActive : true,
        services: {
          create: input.serviceIds.map((serviceId) => ({ serviceId })),
        },
      },
      include: {
        services: {
          include: { service: { select: { id: true, name: true, priceCents: true, durationMinutes: true } } },
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
            include: { service: { select: { id: true, name: true, priceCents: true, durationMinutes: true } } },
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
    // Atualiza automaticamente assinaturas cujo ciclo expirou sem renovação/pagamento
    await prisma.customerSubscription.updateMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        cycleEndDate: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    });

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    const zone = tenant?.timezone || 'America/Sao_Paulo';
    const nowLuxon = DateTime.now().setZone(zone);
    const in7Days = nowLuxon.plus({ days: 7 }).toJSDate();
    const startOfMonth = nowLuxon.startOf('month').toJSDate();

    const [activeSubs, totalSubsCount, allPlans, usagesThisMonth, expiringSoonCount] = await Promise.all([
      prisma.customerSubscription.findMany({
        where: { tenantId, status: 'ACTIVE' },
        include: { plan: { select: { priceCents: true } } },
      }),
      prisma.customerSubscription.count({ where: { tenantId } }),
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
      activeSubscribers: activeCount,
      activeSubscribersCount: activeCount,
      totalSubscribers: totalSubsCount,
      mrrCents,
      monthlyRecurringRevenueCents: mrrCents,
      totalPlans: allPlans,
      activePlansCount: allPlans,
      usagesThisMonth,
      expiringIn7Days: expiringSoonCount,
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
    // Atualiza automaticamente assinaturas cujo ciclo expirou sem renovação/pagamento
    await prisma.customerSubscription.updateMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        cycleEndDate: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    });

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

    const [total, rawSubscriptions] = await Promise.all([
      prisma.customerSubscription.count({ where }),
      prisma.customerSubscription.findMany({
        where,
        orderBy: [{ status: 'asc' }, { cycleEndDate: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: { select: { id: true, name: true, phone: true, whatsappJid: true } },
          plan: {
            include: {
              services: {
                include: { service: { select: { id: true, name: true, priceCents: true, durationMinutes: true } } },
              },
            },
          },
        },
      }),
    ]);

    const subscriptions = rawSubscriptions.map((s) => ({
      ...s,
      lastPaymentDate: s.lastPaymentAt ? s.lastPaymentAt.toISOString() : null,
    }));

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
    const autoRenew = input.autoRenew !== undefined ? Boolean(input.autoRenew) : true;

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
        autoRenew,
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
        autoRenew,
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
        const renewModeText = autoRenew ? '🔄 Renovação Automática Ativa' : '📅 Renovação Manual';

        const welcomeMsg = `👑 *PARABÉNS, ${firstName.toUpperCase()}!*\n\nVocê agora é membro VIP do *${plan.name}* na *${tenant.name}*!\n\n✨ *Benefícios liberados:* ${limitText}\n📅 *Ciclo válido até:* ${endDateFormatted}\n💳 *Mensalidade:* ${formattedPrice}\n⚙️ *Modo de Renovação:* ${renewModeText}\n\nVocê pode consultar seu plano e escolher entre renovação automática ou manual a qualquer momento na página da barbearia. Aproveite! ✂️`;
        await whatsAppService.sendMessage(tenantId, targetPhone, welcomeMsg);
      }
    } catch (waErr) {
      logger.warn({ err: waErr, tenantId }, 'Aviso: Notificação WhatsApp de adesão ao clube não pôde ser enviada');
    }

    return subscription;
  }

  /**
   * Alterna entre Renovação Automática (Auto-Renew) e Renovação Manual para o assinante.
   */
  async toggleAutoRenew(tenantId: string, subscriptionId: string, autoRenew: boolean) {
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

    const updated = await prisma.customerSubscription.update({
      where: { id: subscriptionId },
      data: { autoRenew: Boolean(autoRenew) },
      include: {
        customer: true,
        plan: true,
      },
    });

    // Notifica o cliente via Bot do WhatsApp sobre a mudança de modo de renovação
    try {
      const targetPhone = sub.customer.whatsappJid || sub.customer.phone;
      if (targetPhone) {
        const firstName = sub.customer.name.trim().split(/\s+/)[0] || 'Cliente';
        const endDateFormatted = DateTime.fromJSDate(sub.cycleEndDate).toFormat('dd/MM/yyyy');
        const msg = autoRenew
          ? `🔄 *Renovação Automática Ativada!*\n\nOlá, ${firstName}! Sua assinatura do plano VIP *${sub.plan.name}* na *${sub.tenant.name}* foi configurada para *Renovação Automática*.\n\n📅 *Próxima renovação:* ${endDateFormatted}\nEnviaremos os avisos habituais antes do vencimento!`
          : `📅 *Renovação Manual Configurada!*\n\nOlá, ${firstName}! Sua assinatura do plano VIP *${sub.plan.name}* na *${sub.tenant.name}* agora está no modo de *Renovação Manual*.\n\n📅 *Ciclo atual válido até:* ${endDateFormatted}\nAvisaremos você próximo ao vencimento para que escolha quando renovar!`;
        await whatsAppService.sendMessage(tenantId, targetPhone, msg);
      }
    } catch (waErr) {
      logger.warn({ err: waErr, tenantId }, 'Aviso: Notificação WhatsApp de alteração de Auto-Renew não enviada');
    }

    return updated;
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
        const renewMode = updated.autoRenew ? 'Automática' : 'Manual';
        const renewalMsg = `✅ *Assinatura Renovada com Sucesso!*\n\nOlá, ${firstName}! Seu plano VIP *${sub.plan.name}* na *${sub.tenant.name}* foi renovado.\n\n📅 *Novo ciclo até:* ${formattedDate}\n🔄 *Modo de renovação:* ${renewMode}\n✂️ Seus créditos de corte foram resetados e estão prontos para uso!\n\nTe esperamos para renovar o visual!`;
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
   * Régua de Avisos do Bot WhatsApp para Assinantes do Clube (D-3, D0, D+2).
   * Segue o mesmo fluxo de avisos de vencimento, respeitando a escolha de Auto-Renew vs Manual.
   */
  async runClubRenewalBotWarnings(targetTenantId?: string): Promise<ClubBotWarningResult> {
    const subs = await prisma.customerSubscription.findMany({
      where: {
        ...(targetTenantId ? { tenantId: targetTenantId } : {}),
        status: { in: ['ACTIVE', 'PENDING_PAYMENT'] },
      },
      include: {
        customer: true,
        plan: true,
        tenant: { select: { id: true, name: true, slug: true, timezone: true } },
      },
    });

    let messagesSent = 0;
    let autoRenewedCount = 0;
    let expiredCount = 0;
    const details: ClubBotWarningResult['details'] = [];

    for (const sub of subs) {
      const zone = sub.tenant.timezone || 'America/Sao_Paulo';
      const today = DateTime.now().setZone(zone).startOf('day');
      const expDay = DateTime.fromJSDate(sub.cycleEndDate).setZone(zone).startOf('day');
      const diffDays = Math.round(expDay.diff(today, 'days').days);
      const todayIso = today.toISODate() || '';

      let stage: ClubDunningStage | null = null;
      if (diffDays === 3) stage = 'D-3';
      else if (diffDays === 0) stage = 'D0';
      else if (diffDays <= -2) stage = 'D+2';

      if (!stage) continue;

      const dedupeKey = `CLUB_BOT_NOTICE:${sub.id}:${stage}:${todayIso}`;
      const alreadySent = await prisma.systemLog.findFirst({
        where: {
          tenantId: sub.tenantId,
          source: dedupeKey,
        },
        select: { id: true },
      });

      if (alreadySent) continue;

      const targetPhone = sub.customer.whatsappJid || sub.customer.phone;
      const firstName = sub.customer.name.trim().split(/\s+/)[0] || 'Cliente';
      const formattedPrice = (sub.plan.priceCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const endDateFormatted = DateTime.fromJSDate(sub.cycleEndDate).setZone(zone).toFormat('dd/MM/yyyy');

      let messageText = '';

      if (stage === 'D-3') {
        if (sub.autoRenew) {
          messageText = `👑 *Aviso de Renovação do Clube VIP (3 dias)*\n\nOlá, ${firstName}! Seu plano *${sub.plan.name}* na *${sub.tenant.name}* está programado para *Renovação Automática* em *3 dias* (${endDateFormatted}), no valor de *${formattedPrice}*.\n\nCaso prefira alterar para renovação manual, você pode ajustar a qualquer momento na página da barbearia! ✂️`;
        } else {
          messageText = `👑 *Seu Plano VIP vence em 3 dias!*\n\nOlá, ${firstName}! O ciclo atual do seu plano *${sub.plan.name}* na *${sub.tenant.name}* encerra em *${endDateFormatted}*.\n\nComo sua assinatura está configurada para *Renovação Manual*, lembre-se de confirmar sua renovação conosco (*${formattedPrice}*) para continuar aproveitando seus cortes sem interrupção! ✂️`;
        }
      } else if (stage === 'D0') {
        if (sub.autoRenew) {
          // Renovação Automática ativa: renova o ciclo por +30 dias e avisa o cliente!
          const now = new Date();
          const newEndDate = DateTime.fromJSDate(now).plus({ days: 30 }).toJSDate();
          const newEndFormatted = DateTime.fromJSDate(newEndDate).setZone(zone).toFormat('dd/MM/yyyy');

          await prisma.customerSubscription.update({
            where: { id: sub.id },
            data: {
              cycleStartDate: now,
              cycleEndDate: newEndDate,
              usagesCount: 0,
              status: 'ACTIVE',
            },
          });
          autoRenewedCount++;

          messageText = `🔄 *Renovação Automática Realizada — Clube VIP!*\n\nOlá, ${firstName}! Hoje seu plano *${sub.plan.name}* na *${sub.tenant.name}* iniciou um novo ciclo automático até *${newEndFormatted}* e seus créditos de corte foram renovados!\n\n💳 *Valor da mensalidade:* ${formattedPrice}\nRealize o acerto via PIX ou Cartão na barbearia. Bom corte! ✂️`;
        } else {
          messageText = `⏰ *Seu Plano VIP Vence Hoje!*\n\nOlá, ${firstName}! Hoje (${endDateFormatted}) encerra o ciclo do seu plano *${sub.plan.name}* na *${sub.tenant.name}*.\n\nComo sua assinatura está no modo *Manual*, fale conosco ou acesse nossa página caso deseje renovar seu plano (*${formattedPrice}*) para o próximo mês! 👑`;
        }
      } else if (stage === 'D+2') {
        if (sub.status === 'ACTIVE') {
          await prisma.customerSubscription.update({
            where: { id: sub.id },
            data: { status: 'EXPIRED' },
          });
          expiredCount++;
        }
        messageText = `⚠️ *Aviso de Assinatura VIP Vencida*\n\nOlá, ${firstName}! O ciclo do seu plano *${sub.plan.name}* na *${sub.tenant.name}* venceu em *${endDateFormatted}* e seus benefícios do clube estão temporariamente pausados.\n\nPara reativar sua assinatura por mais 30 dias (*${formattedPrice}*), fale conosco no WhatsApp ou na recepção! 💈`;
      }

      let sent = false;
      if (targetPhone && messageText) {
        try {
          await whatsAppService.sendMessage(sub.tenantId, targetPhone, messageText);
          sent = true;
          messagesSent++;
        } catch (err) {
          logger.warn({ err, tenantId: sub.tenantId, subId: sub.id }, 'Falha ao enviar aviso do Bot do Clube no WhatsApp');
        }
      }

      await prisma.systemLog.create({
        data: {
          tenantId: sub.tenantId,
          level: 'INFO',
          source: dedupeKey,
          message: `Aviso Bot Clube VIP (${stage}) para ${sub.customer.name} [autoRenew=${sub.autoRenew}]`,
        },
      });

      details.push({
        subscriptionId: sub.id,
        customerName: sub.customer.name,
        planName: sub.plan.name,
        stage,
        autoRenew: sub.autoRenew,
        sent,
      });
    }

    return {
      checkedCount: subs.length,
      messagesSent,
      autoRenewedCount,
      expiredCount,
      details,
    };
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

    if (appointmentDate > sub.cycleEndDate) {
      return { covered: false, reason: 'Ciclo do plano expirado. Necessário renovar a assinatura.' };
    }

    const apptWeekday = DateTime.fromJSDate(appointmentDate).weekday === 7 ? 0 : DateTime.fromJSDate(appointmentDate).weekday;
    if (sub.plan.allowedDaysOfWeek && sub.plan.allowedDaysOfWeek.length > 0) {
      if (!sub.plan.allowedDaysOfWeek.includes(apptWeekday)) {
        return { covered: false, reason: 'Este plano VIP não é válido para o dia da semana selecionado.' };
      }
    }

    const isServiceCovered = sub.plan.services.some((s) => s.serviceId === serviceId);
    if (!isServiceCovered) {
      return { covered: false, reason: 'Este serviço não está incluso no plano assinado.' };
    }

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

      const existingUsage = await prisma.clubUsage.findFirst({
        where: { appointmentId },
      });
      if (existingUsage) return;

      const coverage = await this.checkCustomerClubCoverage(
        tenantId,
        appointment.customer.id,
        appointment.serviceId,
        appointment.startAt
      );

      if (!coverage.covered || !coverage.subscriptionId) return;

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
    const [total, rawUsages] = await Promise.all([
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

    const usages = rawUsages.map((u) => ({
      ...u,
      customerId: u.subscription?.customer?.id || '',
      customer: u.subscription?.customer || { id: '', name: 'Cliente', phone: null },
    }));

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

    const [plans, hasOnlinePaymentsFeature, paymentConfig] = await Promise.all([
      prisma.clubPlan.findMany({
        where: { tenantId: tenant.id, isActive: true },
        include: {
          services: {
            include: {
              service: { select: { id: true, name: true, durationMinutes: true, priceCents: true } },
            },
          },
        },
        orderBy: { priceCents: 'asc' },
      }),
      hasPlanFeature(tenant.id, 'onlinePayments').catch(() => false),
      prisma.tenantPaymentConfig.findUnique({ where: { tenantId: tenant.id } }),
    ]);

    const onlinePaymentsEnabled = Boolean(
      hasOnlinePaymentsFeature &&
        paymentConfig?.enabled &&
        paymentConfig?.mpPublicKey &&
        paymentConfig?.mpAccessToken
    );

    return {
      tenantName: tenant.name,
      phone: tenant.phone,
      tenantPhone: tenant.phone,
      onlinePaymentConfig: {
        enabled: onlinePaymentsEnabled,
        mpPublicKey: onlinePaymentsEnabled ? paymentConfig?.mpPublicKey || null : null,
        pixEnabled: paymentConfig?.pixEnabled ?? true,
        creditCardEnabled: paymentConfig?.creditCardEnabled ?? true,
        recurringCardEnabled: paymentConfig?.recurringCardEnabled ?? true,
      },
      plans: plans.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        priceCents: p.priceCents,
        maxUsagesPerMonth: p.maxUsagesPerMonth,
        allowedDaysOfWeek: p.allowedDaysOfWeek,
        services: p.services.map((s) => ({
          service: s.service,
        })),
      })),
    };
  }

  /**
   * Consulta pública da assinatura VIP do cliente pelo telefone na vitrine.
   */
  async getPublicCustomerSubscription(slug: string, rawPhone?: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true },
    });
    if (!tenant) throw HttpError.notFound('Barbearia não encontrada');

    const cleanDigits = rawPhone ? rawPhone.replace(/\D/g, '') : '';
    if (!cleanDigits || cleanDigits.length < 8) {
      throw HttpError.badRequest('Informe um telefone/WhatsApp válido com DDD.');
    }

    const last8 = cleanDigits.slice(-8);
    const phoneVariants = [
      cleanDigits,
      `55${cleanDigits}`,
      cleanDigits.startsWith('55') ? cleanDigits.slice(2) : cleanDigits,
    ];

    const customers = await prisma.customer.findMany({
      where: {
        tenantId: tenant.id,
        OR: [
          { phone: { in: phoneVariants } },
          { phone: { endsWith: last8 } },
          { whatsappJid: { in: phoneVariants.map((p) => `${p}@s.whatsapp.net`) } },
        ],
      },
      select: { id: true, name: true, phone: true },
    });

    if (customers.length === 0) {
      return {
        found: false,
        message: 'Nenhuma assinatura encontrada para este telefone.',
      };
    }

    const customerIds = customers.map((c) => c.id);
    const sub = await prisma.customerSubscription.findFirst({
      where: {
        tenantId: tenant.id,
        customerId: { in: customerIds },
      },
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
      orderBy: { updatedAt: 'desc' },
    });

    if (!sub) {
      return {
        found: false,
        message: 'Você ainda não possui uma assinatura ativa no Clube VIP desta barbearia.',
      };
    }

    return {
      found: true,
      subscription: {
        id: sub.id,
        customerName: sub.customer.name,
        planName: sub.plan.name,
        priceCents: sub.plan.priceCents,
        status: sub.status,
        cycleStartDate: sub.cycleStartDate,
        cycleEndDate: sub.cycleEndDate,
        usagesCount: sub.usagesCount,
        maxUsagesPerMonth: sub.plan.maxUsagesPerMonth,
        autoRenew: sub.autoRenew,
        paymentMethod: sub.paymentMethod,
        services: sub.plan.services.map((s) => s.service.name),
      },
    };
  }

  /**
   * Permite que o próprio cliente ative ou desative o Auto-Renew na vitrine pública.
   */
  async togglePublicCustomerAutoRenew(slug: string, rawPhone: string, autoRenew: boolean) {
    const lookup = await this.getPublicCustomerSubscription(slug, rawPhone);
    if (!lookup.found || !lookup.subscription) {
      throw HttpError.notFound('Assinatura não encontrada para este número de WhatsApp.');
    }

    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { slug },
      select: { id: true },
    });

    const updated = await this.toggleAutoRenew(tenant.id, lookup.subscription.id, autoRenew);
    return {
      success: true,
      autoRenew: updated.autoRenew,
      message: updated.autoRenew
        ? 'Renovação automática ativada com sucesso!'
        : 'Renovação alterada para modo manual com sucesso!',
    };
  }

  /**
   * Processa o checkout online (Cartão de Crédito Recorrente ou PIX) direto na conta Mercado Pago do dono do salão.
   */
  async createPublicOnlineCheckout(
    slug: string,
    input: {
      planId: string;
      customerName: string;
      customerPhone: string;
      customerEmail: string;
      customerDoc?: string;
      method: 'PIX' | 'CREDIT_CARD';
      autoRenew?: boolean;
      cardToken?: string;
      paymentMethodId?: string;
      issuerId?: string;
      installments?: number;
    }
  ) {
    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true, timezone: true },
    });
    if (!tenant) throw HttpError.notFound('Barbearia não encontrada');

    const [hasFeature, paymentConfig, plan] = await Promise.all([
      hasPlanFeature(tenant.id, 'onlinePayments').catch(() => false),
      prisma.tenantPaymentConfig.findUnique({ where: { tenantId: tenant.id } }),
      prisma.clubPlan.findFirst({
        where: { id: input.planId, tenantId: tenant.id, isActive: true },
      }),
    ]);

    if (!hasFeature || !paymentConfig?.enabled || !paymentConfig?.mpAccessToken) {
      throw HttpError.badRequest(
        'Os recebimentos online desta barbearia não estão habilitados no momento. Solicite sua assinatura pelo WhatsApp.'
      );
    }

    if (!plan) {
      throw HttpError.notFound('Plano do Clube VIP não encontrado ou indisponível.');
    }

    const cleanPhone = input.customerPhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      throw HttpError.badRequest('Informe um WhatsApp válido com DDD.');
    }

    const normalizedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

    // Localiza ou cria o cliente na base do salão
    let customer = await prisma.customer.findFirst({
      where: {
        tenantId: tenant.id,
        OR: [{ phone: normalizedPhone }, { phone: cleanPhone }],
      },
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          tenantId: tenant.id,
          name: input.customerName.trim(),
          phone: normalizedPhone,
          email: input.customerEmail.trim(),
        },
      });
    } else if (!customer.email && input.customerEmail) {
      customer = await prisma.customer.update({
        where: { id: customer.id },
        data: { email: input.customerEmail.trim() },
      });
    }

    const autoRenew = input.autoRenew !== undefined ? Boolean(input.autoRenew) : true;
    const transactionAmount = Number((plan.priceCents / 100).toFixed(2));
    const nameParts = input.customerName.trim().split(/\s+/);
    const firstName = nameParts[0] || 'Cliente';
    const lastName = nameParts.slice(1).join(' ') || 'VIP';
    const cleanDoc = (input.customerDoc || '').replace(/\D/g, '');
    const docType = cleanDoc.length > 11 ? 'CNPJ' : 'CPF';

    const rootDomain = process.env.PUBLIC_ROOT_DOMAIN || 'barberflow.azespo.com.br';
    const notificationUrl = `https://${rootDomain}/api/webhooks/tenant-mercadopago/${tenant.id}`;

    const mpPayload: Record<string, any> = {
      transaction_amount: transactionAmount,
      description: `Clube VIP ${tenant.name} — ${plan.name}`,
      payer: {
        email: input.customerEmail.trim(),
        first_name: firstName,
        last_name: lastName,
        ...(cleanDoc
          ? {
              identification: {
                type: docType,
                number: cleanDoc,
              },
            }
          : {}),
      },
      notification_url: notificationUrl,
      metadata: {
        barberflow_club: true,
        tenant_id: tenant.id,
        customer_id: customer.id,
        club_plan_id: plan.id,
        auto_renew: autoRenew,
      },
    };

    if (input.method === 'PIX') {
      mpPayload.payment_method_id = 'pix';
    } else {
      if (!input.cardToken) {
        throw HttpError.badRequest('Token do cartão de crédito não gerado.');
      }
      mpPayload.token = input.cardToken;
      mpPayload.installments = input.installments && input.installments >= 1 ? Number(input.installments) : 1;
      if (input.paymentMethodId) mpPayload.payment_method_id = input.paymentMethodId;
      if (input.issuerId) mpPayload.issuer_id = Number(input.issuerId);
    }

    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paymentConfig.mpAccessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `club-${tenant.id}-${customer.id}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      },
      body: JSON.stringify(mpPayload),
    });

    const mpData = (await mpResponse.json()) as any;
    if (!mpResponse.ok) {
      const detail =
        mpData?.cause?.[0]?.description ||
        mpData?.message ||
        'Pagamento recusado pela operadora ou dados inválidos.';
      throw HttpError.badRequest(`Falha ao processar pagamento: ${detail}`);
    }

    const mpPaymentId = String(mpData.id);
    const mpStatus = String(mpData.status || 'pending');
    const poi = mpData.point_of_interaction?.transaction_data;

    if (mpStatus === 'approved') {
      await this.activateSubscriptionFromOnlinePayment({
        tenantId: tenant.id,
        customerId: customer.id,
        planId: plan.id,
        autoRenew,
        paymentMethod: input.method === 'PIX' ? 'PIX' : 'CARTAO_CREDITO',
        mpPaymentId,
        cardLastFour: mpData.card?.last_four_digits || null,
        cardBrand: mpData.payment_method_id || null,
      });

      return {
        approved: true,
        paymentId: mpPaymentId,
        status: mpStatus,
        message: `Parabéns! Sua assinatura no plano ${plan.name} foi aprovada e já está ativa!`,
      };
    }

    // Se for PIX (ou pendente), registra ou mantém a assinatura aguardando a confirmação do pagamento
    const existingSub = await prisma.customerSubscription.findUnique({
      where: { tenantId_customerId: { tenantId: tenant.id, customerId: customer.id } },
    });

    if (!existingSub) {
      const now = new Date();
      const endDate = DateTime.now().setZone(tenant.timezone).plus({ days: 30 }).toJSDate();
      await prisma.customerSubscription.create({
        data: {
          tenantId: tenant.id,
          customerId: customer.id,
          planId: plan.id,
          status: 'PENDING_PAYMENT',
          cycleStartDate: now,
          cycleEndDate: endDate,
          usagesCount: 0,
          paymentMethod: input.method === 'PIX' ? 'PIX' : 'CARTAO_CREDITO',
          autoRenew,
          mpLastPaymentId: mpPaymentId,
        },
      });
    } else {
      await prisma.customerSubscription.update({
        where: { id: existingSub.id },
        data: {
          planId: plan.id,
          autoRenew,
          mpLastPaymentId: mpPaymentId,
        },
      });
    }

    return {
      approved: false,
      paymentId: mpPaymentId,
      status: mpStatus,
      qrCode: poi?.qr_code || null,
      qrCodeBase64: poi?.qr_code_base64 || null,
      ticketUrl: poi?.ticket_url || null,
    };
  }

  /**
   * Confirma e ativa a assinatura do Clube VIP quando o pagamento no Mercado Pago do salão é aprovado.
   */
  async activateSubscriptionFromOnlinePayment(params: {
    tenantId: string;
    customerId: string;
    planId: string;
    autoRenew: boolean;
    paymentMethod: string;
    mpPaymentId: string;
    cardLastFour?: string | null;
    cardBrand?: string | null;
  }) {
    const { tenantId, customerId, planId, autoRenew, paymentMethod, mpPaymentId, cardLastFour, cardBrand } = params;

    const [tenant, customer, plan, existingSub] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, timezone: true } }),
      prisma.customer.findUnique({ where: { id: customerId } }),
      prisma.clubPlan.findUnique({ where: { id: planId } }),
      prisma.customerSubscription.findUnique({
        where: { tenantId_customerId: { tenantId, customerId } },
      }),
    ]);

    if (!tenant || !customer || !plan) return null;

    // Idempotência: se este mpPaymentId já ativou a assinatura hoje, não duplica
    if (
      existingSub &&
      existingSub.status === 'ACTIVE' &&
      existingSub.mpLastPaymentId === mpPaymentId &&
      existingSub.lastPaymentAt &&
      Date.now() - existingSub.lastPaymentAt.getTime() < 24 * 60 * 60 * 1000
    ) {
      return existingSub;
    }

    const now = new Date();
    const zone = tenant.timezone || 'America/Sao_Paulo';
    const isExtendingActive =
      existingSub &&
      existingSub.status === 'ACTIVE' &&
      existingSub.cycleEndDate > now;

    const baseEnd = isExtendingActive
      ? DateTime.fromJSDate(existingSub.cycleEndDate).setZone(zone)
      : DateTime.fromJSDate(now).setZone(zone);

    const nextEndDate = baseEnd.plus({ days: 30 }).toJSDate();

    const sub = await prisma.customerSubscription.upsert({
      where: { tenantId_customerId: { tenantId, customerId } },
      create: {
        tenantId,
        customerId,
        planId,
        status: 'ACTIVE',
        cycleStartDate: now,
        cycleEndDate: nextEndDate,
        usagesCount: 0,
        paymentMethod,
        lastPaymentAt: now,
        autoRenew,
        mpLastPaymentId: mpPaymentId,
        cardLastFour: cardLastFour || null,
        cardBrand: cardBrand || null,
        notes: `Assinatura paga online via Mercado Pago (#${mpPaymentId})`,
      },
      update: {
        planId,
        status: 'ACTIVE',
        cycleStartDate: isExtendingActive ? existingSub.cycleStartDate : now,
        cycleEndDate: nextEndDate,
        usagesCount: 0,
        paymentMethod,
        lastPaymentAt: now,
        autoRenew,
        mpLastPaymentId: mpPaymentId,
        cardLastFour: cardLastFour || existingSub?.cardLastFour || null,
        cardBrand: cardBrand || existingSub?.cardBrand || null,
      },
    });

    // Registra a entrada financeira no Fluxo de Caixa (/finance) do salão
    await prisma.transaction
      .create({
        data: {
          tenantId,
          type: 'INCOME',
          category: 'Clube VIP',
          description: `Assinatura Online Clube VIP (${plan.name}) — ${customer.name} [MP #${mpPaymentId}]`,
          amountCents: plan.priceCents,
          paymentMethod: paymentMethod === 'PIX' ? 'PIX' : 'CREDIT_CARD',
          occurredAt: now,
        },
      })
      .catch(() => {});

    // Dispara confirmação de boas-vindas / renovação no WhatsApp do cliente
    const targetPhone = customer.whatsappJid || customer.phone;
    if (targetPhone) {
      const endDateFormatted = DateTime.fromJSDate(nextEndDate).setZone(zone).toFormat('dd/MM/yyyy');
      const priceStr = (plan.priceCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const welcomeVipMsg =
        `👑 *Pagamento Confirmado — Clube VIP ${tenant.name}!*\n\n` +
        `Olá, *${customer.name}*! Seu pagamento de *${priceStr}* do plano *${plan.name}* foi aprovado com sucesso!\n\n` +
        `✅ *Status:* Ativo até *${endDateFormatted}*\n` +
        `🔄 *Modo de Renovação:* ${autoRenew ? 'Automática (Auto-Renew)' : 'Manual'}\n\n` +
        `Você já pode agendar seus horários normalmente pelo WhatsApp ou pelo nosso link e seus usos serão cobertos pelo seu plano VIP! ✂️💈`;

      await whatsAppService.sendMessage(tenantId, targetPhone, welcomeVipMsg).catch(() => {});
    }

    return sub;
  }

  /**
   * Consulta o status de um pagamento online do Clube VIP diretamente na conta Mercado Pago do salão.
   */
  async checkPublicOnlinePaymentStatus(slugOrTenantId: string, mpPaymentId: string, byTenantId = false) {
    const tenant = byTenantId
      ? await prisma.tenant.findUnique({ where: { id: slugOrTenantId }, select: { id: true, name: true } })
      : await prisma.tenant.findUnique({ where: { slug: slugOrTenantId }, select: { id: true, name: true } });

    if (!tenant) throw HttpError.notFound('Barbearia não encontrada');

    const paymentConfig = await prisma.tenantPaymentConfig.findUnique({
      where: { tenantId: tenant.id },
    });

    if (!paymentConfig?.mpAccessToken) {
      return { approved: false, status: 'pending' };
    }

    const mpRes = await fetch(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(mpPaymentId)}`,
      {
        headers: {
          Authorization: `Bearer ${paymentConfig.mpAccessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!mpRes.ok) {
      return { approved: false, status: 'pending' };
    }

    const mpData = (await mpRes.json()) as any;
    const status = String(mpData.status || 'pending');

    if (status === 'approved') {
      const meta = mpData.metadata || {};
      const customerId = (meta.customer_id || meta.customerId) as string | undefined;
      const planId = (meta.club_plan_id || meta.clubPlanId) as string | undefined;
      const autoRenew = meta.auto_renew !== undefined ? Boolean(meta.auto_renew) : true;

      if (customerId && planId) {
        await this.activateSubscriptionFromOnlinePayment({
          tenantId: tenant.id,
          customerId,
          planId,
          autoRenew,
          paymentMethod: mpData.payment_method_id === 'pix' ? 'PIX' : 'CARTAO_CREDITO',
          mpPaymentId: String(mpData.id),
          cardLastFour: mpData.card?.last_four_digits || null,
          cardBrand: mpData.payment_method_id || null,
        });
      } else {
        // Fallback: busca pelo mpLastPaymentId salvo na CustomerSubscription
        const subByPayment = await prisma.customerSubscription.findFirst({
          where: { tenantId: tenant.id, mpLastPaymentId: String(mpPaymentId) },
        });
        if (subByPayment) {
          await this.activateSubscriptionFromOnlinePayment({
            tenantId: tenant.id,
            customerId: subByPayment.customerId,
            planId: subByPayment.planId,
            autoRenew: subByPayment.autoRenew,
            paymentMethod: mpData.payment_method_id === 'pix' ? 'PIX' : 'CARTAO_CREDITO',
            mpPaymentId: String(mpData.id),
            cardLastFour: mpData.card?.last_four_digits || null,
            cardBrand: mpData.payment_method_id || null,
          });
        }
      }

      return { approved: true, status: 'approved' };
    }

    return { approved: false, status };
  }
}

export const clubService = new ClubService();
