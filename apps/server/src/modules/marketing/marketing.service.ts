import { DateTime } from 'luxon';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { HttpError } from '../../lib/http-error.js';
import { whatsAppService } from '../whatsapp/whatsapp.service.js';
import { assertPlanFeature } from '../../lib/tenant-access.js';
import type { MarketingCampaignType, MarketingDeliveryStatus } from '@prisma/client';

export interface UpdateMarketingConfigInput {
  enabled?: boolean;
  inactiveRecoveryEnabled?: boolean;
  inactiveDaysThreshold?: number;
  inactiveMessageTemplate?: string;
  inactiveDiscountPercent?: number | null;
  birthdayEnabled?: boolean;
  birthdayMessageTemplate?: string;
  birthdayDiscountPercent?: number | null;
  sendWindowStart?: string;
  sendWindowEnd?: string;
  minDaysBetweenMessages?: number;
  maxDailyDispatches?: number;
}

export class MarketingService {
  /**
   * Obtém a configuração de marketing da barbearia (ou cria com padrões).
   */
  async getConfig(tenantId: string) {
    let config = await prisma.marketingConfig.findUnique({
      where: { tenantId },
    });

    if (!config) {
      config = await prisma.marketingConfig.create({
        data: { tenantId },
      });
    }

    return config;
  }

  /**
   * Atualiza as configurações de marketing da barbearia.
   */
  async updateConfig(tenantId: string, data: UpdateMarketingConfigInput) {
    await assertPlanFeature(tenantId, 'marketing');

    return prisma.marketingConfig.upsert({
      where: { tenantId },
      update: { ...data },
      create: { tenantId, ...data },
    });
  }

  /**
   * Obtém métricas gerais de marketing e conversão.
   */
  async getStats(tenantId: string) {
    const config = await this.getConfig(tenantId);
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true, slug: true, name: true },
    });
    const zone = tenant?.timezone || 'America/Sao_Paulo';
    const nowLuxon = DateTime.now().setZone(zone);

    // 1. Clientes inativos (> X dias)
    const inactiveThresholdDate = nowLuxon.minus({ days: config.inactiveDaysThreshold }).toJSDate();

    // Clientes que já concluíram agendamentos
    const customersWithVisits = await prisma.customer.findMany({
      where: {
        tenantId,
        phone: { not: null },
        appointments: {
          some: { status: 'COMPLETED' },
        },
      },
      select: {
        id: true,
        appointments: {
          where: { status: 'COMPLETED' },
          orderBy: { endAt: 'desc' },
          take: 1,
          select: { endAt: true },
        },
        _count: {
          select: {
            appointments: {
              where: {
                status: { in: ['SCHEDULED', 'CONFIRMED', 'DELAYED'] },
                startAt: { gte: nowLuxon.toJSDate() },
              },
            },
          },
        },
      },
    });

    const inactiveCustomerIds = customersWithVisits
      .filter((c) => {
        const lastVisit = c.appointments[0]?.endAt;
        const hasFuture = c._count.appointments > 0;
        return lastVisit && lastVisit < inactiveThresholdDate && !hasFuture;
      })
      .map((c) => c.id);

    // 2. Aniversariantes de hoje
    const currentMonth = nowLuxon.month;
    const currentDay = nowLuxon.day;

    const customersWithBirthdays = await prisma.customer.findMany({
      where: {
        tenantId,
        birthDate: { not: null },
        phone: { not: null },
      },
      select: { id: true, birthDate: true },
    });

    const birthdaysTodayIds = customersWithBirthdays
      .filter((c) => {
        if (!c.birthDate) return false;
        const b = DateTime.fromJSDate(c.birthDate).setZone(zone);
        return b.month === currentMonth && b.day === currentDay;
      })
      .map((c) => c.id);

    // 3. Disparos deste mês e de hoje
    const startOfMonth = nowLuxon.startOf('month').toJSDate();
    const startOfDay = nowLuxon.startOf('day').toJSDate();

    const [sentThisMonth, sentToday, totalSent] = await Promise.all([
      prisma.marketingMessageLog.count({
        where: { tenantId, status: 'SENT', sentAt: { gte: startOfMonth } },
      }),
      prisma.marketingMessageLog.count({
        where: { tenantId, status: 'SENT', sentAt: { gte: startOfDay } },
      }),
      prisma.marketingMessageLog.count({
        where: { tenantId, status: 'SENT' },
      }),
    ]);

    // 4. Clientes recuperados (que receberam INACTIVE_RECOVERY e depois tiveram agendamento COMPLETED)
    const recoveryLogs = await prisma.marketingMessageLog.findMany({
      where: { tenantId, type: 'INACTIVE_RECOVERY', status: 'SENT' },
      select: { customerId: true, sentAt: true },
    });

    const recoveredCustomerIds = new Set<string>();
    for (const log of recoveryLogs) {
      const bookedAfter = await prisma.appointment.findFirst({
        where: {
          tenantId,
          customerId: log.customerId,
          status: 'COMPLETED',
          createdAt: { gt: log.sentAt },
        },
        select: { id: true },
      });
      if (bookedAfter) {
        recoveredCustomerIds.add(log.customerId);
      }
    }

    const whatsAppConn = whatsAppService.getConnection(tenantId);
    const isWhatsAppConnected = whatsAppConn?.status === 'CONNECTED';

    return {
      config,
      isWhatsAppConnected,
      stats: {
        inactiveCount: inactiveCustomerIds.length,
        birthdaysTodayCount: birthdaysTodayIds.length,
        sentToday,
        sentThisMonth,
        totalSent,
        recoveredCount: recoveredCustomerIds.size,
        dailyRemainingQuota: Math.max(0, config.maxDailyDispatches - sentToday),
      },
    };
  }

  /**
   * Lista clientes inativos elegíveis para recuperação.
   */
  async listEligibleInactive(tenantId: string, page = 1, pageSize = 20, search?: string) {
    const config = await this.getConfig(tenantId);
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    const zone = tenant?.timezone || 'America/Sao_Paulo';
    const nowLuxon = DateTime.now().setZone(zone);
    const thresholdDate = nowLuxon.minus({ days: config.inactiveDaysThreshold }).toJSDate();

    const customers = await prisma.customer.findMany({
      where: {
        tenantId,
        phone: { not: null },
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search.replace(/\D/g, '') } },
              ],
            }
          : {}),
        appointments: {
          some: { status: 'COMPLETED' },
        },
      },
      include: {
        appointments: {
          where: { status: 'COMPLETED' },
          orderBy: { endAt: 'desc' },
          take: 1,
          select: { endAt: true, service: { select: { name: true } }, professional: { select: { name: true } } },
        },
        marketingLogs: {
          where: { type: 'INACTIVE_RECOVERY' },
          orderBy: { sentAt: 'desc' },
          take: 1,
          select: { sentAt: true, status: true },
        },
        _count: {
          select: {
            appointments: {
              where: {
                status: { in: ['SCHEDULED', 'CONFIRMED', 'DELAYED'] },
                startAt: { gte: nowLuxon.toJSDate() },
              },
            },
          },
        },
      },
    });

    const minCooldownDate = nowLuxon.minus({ days: config.minDaysBetweenMessages }).toJSDate();

    const eligible = customers
      .filter((c) => {
        const lastVisit = c.appointments[0]?.endAt;
        const hasFuture = c._count.appointments > 0;
        return lastVisit && lastVisit < thresholdDate && !hasFuture;
      })
      .map((c) => {
        const lastVisit = c.appointments[0]?.endAt!;
        const diffDays = Math.floor(nowLuxon.diff(DateTime.fromJSDate(lastVisit).setZone(zone), 'days').days);
        const lastSent = c.marketingLogs[0]?.sentAt;
        const isEligibleNow = !lastSent || lastSent < minCooldownDate;

        return {
          id: c.id,
          name: c.name,
          phone: c.phone,
          lastVisitAt: lastVisit,
          daysSinceLastVisit: diffDays,
          lastService: c.appointments[0]?.service?.name || 'Corte',
          lastProfessional: c.appointments[0]?.professional?.name || 'Barbeiro',
          lastContactAt: lastSent || null,
          canSendNow: isEligibleNow,
        };
      })
      .sort((a, b) => b.daysSinceLastVisit - a.daysSinceLastVisit);

    const total = eligible.length;
    const paginated = eligible.slice((page - 1) * pageSize, page * pageSize);

    return {
      customers: paginated,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  /**
   * Lista aniversariantes do dia e dos próximos 7 dias.
   */
  async listEligibleBirthdays(tenantId: string) {
    const config = await this.getConfig(tenantId);
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    const zone = tenant?.timezone || 'America/Sao_Paulo';
    const nowLuxon = DateTime.now().setZone(zone);
    const currentMonth = nowLuxon.month;
    const currentDay = nowLuxon.day;

    const customers = await prisma.customer.findMany({
      where: {
        tenantId,
        birthDate: { not: null },
        phone: { not: null },
      },
      include: {
        marketingLogs: {
          where: { type: 'BIRTHDAY' },
          orderBy: { sentAt: 'desc' },
          take: 1,
          select: { sentAt: true, status: true },
        },
      },
    });

    const minCooldownDate = nowLuxon.minus({ days: 300 }).toJSDate(); // 1 parabéns por ano

    const mapped = customers
      .map((c) => {
        if (!c.birthDate) return null;
        const b = DateTime.fromJSDate(c.birthDate).setZone(zone);
        const isToday = b.month === currentMonth && b.day === currentDay;

        // Calcula quantos dias faltam para o próximo aniversário
        let nextBirthday = DateTime.fromObject({ year: nowLuxon.year, month: b.month, day: b.day }, { zone });
        if (nextBirthday < nowLuxon.startOf('day')) {
          nextBirthday = nextBirthday.plus({ years: 1 });
        }
        const daysUntil = Math.round(nextBirthday.diff(nowLuxon.startOf('day'), 'days').days);
        const lastSent = c.marketingLogs[0]?.sentAt;
        const canSendNow = !lastSent || lastSent < minCooldownDate;

        return {
          id: c.id,
          name: c.name,
          phone: c.phone,
          birthDate: c.birthDate,
          birthDay: b.day,
          birthMonth: b.month,
          isToday,
          daysUntil,
          lastContactAt: lastSent || null,
          canSendNow,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item && (item.isToday || item.daysUntil <= 7)))
      .sort((a, b) => a.daysUntil - b.daysUntil);

    return {
      today: mapped.filter((m) => m.isToday),
      upcoming: mapped.filter((m) => !m.isToday),
    };
  }

  /**
   * Renderiza a mensagem substituindo variáveis contextuais.
   */
  private renderMessage(
    template: string,
    params: { cliente: string; barbearia: string; link: string; desconto?: string; dias?: number }
  ): string {
    let result = template;
    result = result.replace(/\{cliente\}/gi, params.cliente);
    result = result.replace(/\{barbearia\}/gi, params.barbearia);
    result = result.replace(/\{link\}/gi, params.link);
    result = result.replace(/\{desconto\}/gi, params.desconto || 'desconto especial');
    if (params.dias !== undefined) {
      result = result.replace(/\{dias\}/gi, String(params.dias));
    }
    return result;
  }

  /**
   * Dispara uma mensagem de teste para o número informado.
   */
  async sendTestMessage(tenantId: string, phone: string, type: MarketingCampaignType) {
    await assertPlanFeature(tenantId, 'marketing');

    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { name: true, slug: true },
    });
    const config = await this.getConfig(tenantId);

    const link = `https://barberflow.azespo.com.br/${tenant.slug}/agendar`;
    let template =
      type === 'BIRTHDAY' ? config.birthdayMessageTemplate : config.inactiveMessageTemplate;

    const discountText =
      type === 'BIRTHDAY' && config.birthdayDiscountPercent
        ? `${config.birthdayDiscountPercent}% OFF`
        : config.inactiveDiscountPercent
        ? `${config.inactiveDiscountPercent}% OFF`
        : 'um mimo especial';

    const message = this.renderMessage(template, {
      cliente: 'Cliente Teste',
      barbearia: tenant.name,
      link,
      desconto: discountText,
      dias: config.inactiveDaysThreshold,
    });

    const sent = await whatsAppService.sendMessage(tenantId, phone, message);
    if (!sent) {
      throw HttpError.badRequest('Não foi possível enviar a mensagem. Verifique se o seu WhatsApp está conectado.');
    }

    return { success: true, message, phone };
  }

  /**
   * Dispara mensagem individual para um cliente.
   */
  async sendSingle(
    tenantId: string,
    customerId: string,
    type: MarketingCampaignType,
    customMessage?: string
  ) {
    await assertPlanFeature(tenantId, 'marketing');

    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { name: true, slug: true, timezone: true },
    });
    const config = await this.getConfig(tenantId);
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, tenantId },
      select: { id: true, name: true, phone: true, whatsappJid: true },
    });

    if (!customer || (!customer.phone && !customer.whatsappJid)) {
      throw HttpError.badRequest('Cliente não possui telefone cadastrado.');
    }

    const targetPhone = customer.whatsappJid || customer.phone!;
    const firstName = customer.name.trim().split(/\s+/)[0] || 'Cliente';
    const link = `https://barberflow.azespo.com.br/${tenant.slug}/agendar`;

    const discountText =
      type === 'BIRTHDAY' && config.birthdayDiscountPercent
        ? `${config.birthdayDiscountPercent}% OFF`
        : config.inactiveDiscountPercent
        ? `${config.inactiveDiscountPercent}% OFF`
        : 'desconto especial';

    const finalMessage =
      customMessage ||
      this.renderMessage(
        type === 'BIRTHDAY' ? config.birthdayMessageTemplate : config.inactiveMessageTemplate,
        {
          cliente: firstName,
          barbearia: tenant.name,
          link,
          desconto: discountText,
          dias: config.inactiveDaysThreshold,
        }
      );

    try {
      const sent = await whatsAppService.sendMessage(tenantId, targetPhone, finalMessage);
      if (!sent) {
        await prisma.marketingMessageLog.create({
          data: {
            tenantId,
            customerId: customer.id,
            type,
            status: 'FAILED',
            phone: targetPhone,
            message: finalMessage,
            errorMessage: 'WhatsApp não conectado ou falha de entrega',
          },
        });
        throw HttpError.badRequest('Falha ao enviar via WhatsApp. Verifique se o aparelho está conectado.');
      }

      await prisma.marketingMessageLog.create({
        data: {
          tenantId,
          customerId: customer.id,
          type,
          status: 'SENT',
          phone: targetPhone,
          message: finalMessage,
        },
      });

      return { success: true, message: 'Mensagem enviada com sucesso!' };
    } catch (err: any) {
      logger.error({ err, tenantId, customerId }, 'Erro ao enviar mensagem individual de marketing');
      throw err;
    }
  }

  /**
   * Dispara campanha em lote com proteção anti-ban (janela de horário e espaçamento).
   */
  async sendBatch(tenantId: string, type: MarketingCampaignType, customerIds?: string[]) {
    await assertPlanFeature(tenantId, 'marketing');

    const config = await this.getConfig(tenantId);
    if (!config.enabled) {
      throw HttpError.badRequest('O módulo de marketing está desativado para este salão.');
    }

    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { name: true, slug: true, timezone: true },
    });
    const zone = tenant.timezone || 'America/Sao_Paulo';
    const nowLuxon = DateTime.now().setZone(zone);

    // Valida janela de envio
    const [startH, startM] = (config.sendWindowStart || '09:00').split(':').map(Number);
    const [endH, endM] = (config.sendWindowEnd || '19:00').split(':').map(Number);
    const windowStart = nowLuxon.set({ hour: startH, minute: startM, second: 0 });
    const windowEnd = nowLuxon.set({ hour: endH, minute: endM, second: 0 });

    if (nowLuxon < windowStart || nowLuxon > windowEnd) {
      throw HttpError.badRequest(
        `Os disparos de marketing só podem ser realizados no horário comercial permitido (${config.sendWindowStart} às ${config.sendWindowEnd}).`
      );
    }

    // Checa cota diária
    const startOfDay = nowLuxon.startOf('day').toJSDate();
    const sentToday = await prisma.marketingMessageLog.count({
      where: { tenantId, status: 'SENT', sentAt: { gte: startOfDay } },
    });

    const remainingQuota = Math.max(0, config.maxDailyDispatches - sentToday);
    if (remainingQuota <= 0) {
      throw HttpError.badRequest(
        `Limite diário de segurança anti-ban atingido (${config.maxDailyDispatches} mensagens hoje). Novos disparos serão liberados amanhã.`
      );
    }

    // Seleciona alvos
    let targets: Array<{ id: string; name: string; phone: string }> = [];

    if (customerIds && customerIds.length > 0) {
      const customers = await prisma.customer.findMany({
        where: { tenantId, id: { in: customerIds }, phone: { not: null } },
        select: { id: true, name: true, phone: true },
      });
      targets = customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone! }));
    } else if (type === 'INACTIVE_RECOVERY') {
      const list = await this.listEligibleInactive(tenantId, 1, remainingQuota);
      targets = list.customers
        .filter((c) => c.canSendNow && c.phone)
        .map((c) => ({ id: c.id, name: c.name, phone: c.phone! }));
    } else if (type === 'BIRTHDAY') {
      const list = await this.listEligibleBirthdays(tenantId);
      targets = list.today
        .filter((c) => c.canSendNow && c.phone)
        .map((c) => ({ id: c.id, name: c.name, phone: c.phone! }));
    }

    const toProcess = targets.slice(0, remainingQuota);
    let sentCount = 0;
    let failedCount = 0;

    const link = `https://barberflow.azespo.com.br/${tenant.slug}/agendar`;
    const discountText =
      type === 'BIRTHDAY' && config.birthdayDiscountPercent
        ? `${config.birthdayDiscountPercent}% OFF`
        : config.inactiveDiscountPercent
        ? `${config.inactiveDiscountPercent}% OFF`
        : 'desconto especial';

    const template =
      type === 'BIRTHDAY' ? config.birthdayMessageTemplate : config.inactiveMessageTemplate;

    for (const target of toProcess) {
      const firstName = target.name.trim().split(/\s+/)[0] || 'Cliente';
      const msg = this.renderMessage(template, {
        cliente: firstName,
        barbearia: tenant.name,
        link,
        desconto: discountText,
        dias: config.inactiveDaysThreshold,
      });

      try {
        const ok = await whatsAppService.sendMessage(tenantId, target.phone, msg);
        if (ok) {
          await prisma.marketingMessageLog.create({
            data: {
              tenantId,
              customerId: target.id,
              type,
              status: 'SENT',
              phone: target.phone,
              message: msg,
            },
          });
          sentCount++;
        } else {
          await prisma.marketingMessageLog.create({
            data: {
              tenantId,
              customerId: target.id,
              type,
              status: 'FAILED',
              phone: target.phone,
              message: msg,
              errorMessage: 'Falha de entrega no WhatsApp',
            },
          });
          failedCount++;
        }
      } catch (err: any) {
        failedCount++;
        logger.warn({ err, tenantId, customerId: target.id }, 'Erro no envio de mensagem do lote');
      }

      // Delay aleatório suave (1 a 2 segundos) entre disparos para não disparar em rajada
      await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));
    }

    return {
      success: true,
      sentCount,
      failedCount,
      totalProcessed: toProcess.length,
      remainingDailyQuota: Math.max(0, config.maxDailyDispatches - (sentToday + sentCount)),
    };
  }

  /**
   * Lista o histórico de disparos de marketing.
   */
  async listLogs(tenantId: string, page = 1, pageSize = 20, type?: MarketingCampaignType) {
    const where = {
      tenantId,
      ...(type ? { type } : {}),
    };

    const [total, logs] = await Promise.all([
      prisma.marketingMessageLog.count({ where }),
      prisma.marketingMessageLog.findMany({
        where,
        orderBy: { sentAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
        },
      }),
    ]);

    return {
      logs,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }
}

export const marketingService = new MarketingService();
