import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { whatsAppService } from '../whatsapp/whatsapp.service.js';

export interface LoyaltyConfigData {
  enabled: boolean;
  targetStamps: number;
  rewardText: string;
  autoSendWhatsApp: boolean;
  showInPublicShowcase: boolean;
}

export const DEFAULT_LOYALTY_CONFIG: LoyaltyConfigData = {
  enabled: true,
  targetStamps: 10,
  rewardText: '1 Corte ou Barba Grátis',
  autoSendWhatsApp: true,
  showInPublicShowcase: true,
};

/**
 * Obtém ou inicializa a configuração do Cartão Fidelidade da barbearia.
 */
export async function getLoyaltyConfig(tenantId: string) {
  let config = await prisma.loyaltyConfig.findUnique({
    where: { tenantId },
  });

  if (!config) {
    config = await prisma.loyaltyConfig.create({
      data: {
        tenantId,
        ...DEFAULT_LOYALTY_CONFIG,
      },
    });
  }

  return config;
}

/**
 * Atualiza a configuração do Cartão Fidelidade.
 */
export async function updateLoyaltyConfig(
  tenantId: string,
  data: Partial<LoyaltyConfigData>,
) {
  const current = await getLoyaltyConfig(tenantId);
  const targetStamps = Math.min(50, Math.max(2, data.targetStamps ?? current.targetStamps));

  return prisma.loyaltyConfig.update({
    where: { tenantId },
    data: {
      enabled: typeof data.enabled === 'boolean' ? data.enabled : current.enabled,
      targetStamps,
      rewardText: (data.rewardText || current.rewardText).trim(),
      autoSendWhatsApp:
        typeof data.autoSendWhatsApp === 'boolean'
          ? data.autoSendWhatsApp
          : current.autoSendWhatsApp,
      showInPublicShowcase:
        typeof data.showInPublicShowcase === 'boolean'
          ? data.showInPublicShowcase
          : current.showInPublicShowcase,
    },
  });
}

/**
 * Coleta métricas de desempenho do Cartão Fidelidade para o salão.
 */
export async function getLoyaltyDashboardStats(tenantId: string) {
  const [config, totalCards, cardsWithRewards, completedTransactions] = await Promise.all([
    getLoyaltyConfig(tenantId),
    prisma.loyaltyCard.count({ where: { tenantId } }),
    prisma.loyaltyCard.count({ where: { tenantId, rewardsAvailable: { gt: 0 } } }),
    prisma.loyaltyTransaction.findMany({
      where: { tenantId },
      select: { type: true, stampsChange: true },
    }),
  ]);

  let totalStampsDistributed = 0;
  let totalRewardsRedeemed = 0;

  for (const t of completedTransactions) {
    if (t.type === 'STAMP_ADDED') {
      totalStampsDistributed += t.stampsChange;
    } else if (t.type === 'REWARD_REDEEMED') {
      totalRewardsRedeemed += 1;
    }
  }

  return {
    config,
    stats: {
      totalCards,
      totalStampsDistributed,
      totalRewardsRedeemed,
      rewardsReadyToRedeem: cardsWithRewards,
    },
  };
}

/**
 * Lista os cartões de fidelidade dos clientes com paginação e busca.
 */
export async function listLoyaltyCards(
  tenantId: string,
  params: {
    search?: string;
    filter?: 'ALL' | 'READY_TO_REDEEM';
    page?: number;
    limit?: number;
  },
) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(5, params.limit || 20));
  const skip = (page - 1) * limit;

  const where: any = { tenantId };

  if (params.filter === 'READY_TO_REDEEM') {
    where.rewardsAvailable = { gt: 0 };
  }

  if (params.search && params.search.trim() !== '') {
    const q = params.search.trim();
    where.customer = {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ],
    };
  }

  const [cards, total] = await Promise.all([
    prisma.loyaltyCard.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ rewardsAvailable: 'desc' }, { lastStampAt: 'desc' }, { currentStamps: 'desc' }],
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            whatsappJid: true,
          },
        },
      },
    }),
    prisma.loyaltyCard.count({ where }),
  ]);

  return {
    cards,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Obtém o cartão de fidelidade de um cliente específico com o extrato de transações.
 */
export async function getCustomerLoyaltyDetails(tenantId: string, customerId: string) {
  const config = await getLoyaltyConfig(tenantId);

  let card = await prisma.loyaltyCard.findUnique({
    where: { tenantId_customerId: { tenantId, customerId } },
    include: {
      customer: true,
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  });

  if (!card) {
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
    });

    card = await prisma.loyaltyCard.create({
      data: {
        tenantId,
        customerId: customer.id,
        currentStamps: 0,
        completedCycles: 0,
        rewardsAvailable: 0,
      },
      include: {
        customer: true,
        transactions: true,
      },
    });
  }

  return {
    config,
    card,
  };
}

/**
 * Adiciona ou remove selos manualmente de um cliente (ajuste pelo barbeiro ou recepção).
 */
export async function manualAdjustStamps(
  tenantId: string,
  customerId: string,
  stampsChange: number,
  notes?: string,
) {
  const config = await getLoyaltyConfig(tenantId);
  const { card } = await getCustomerLoyaltyDetails(tenantId, customerId);

  let nextStamps = card.currentStamps + stampsChange;
  let nextCycles = card.completedCycles;
  let nextRewards = card.rewardsAvailable;

  // Se somou selos e ultrapassou a meta
  while (nextStamps >= config.targetStamps) {
    nextStamps -= config.targetStamps;
    nextCycles += 1;
    nextRewards += 1;
  }

  if (nextStamps < 0) {
    nextStamps = 0;
  }

  const updatedCard = await prisma.loyaltyCard.update({
    where: { id: card.id },
    data: {
      currentStamps: nextStamps,
      completedCycles: nextCycles,
      rewardsAvailable: nextRewards,
      lastStampAt: new Date(),
    },
    include: { customer: true },
  });

  await prisma.loyaltyTransaction.create({
    data: {
      tenantId,
      loyaltyCardId: card.id,
      type: 'MANUAL_ADJUSTMENT',
      stampsChange,
      notes: notes || 'Ajuste manual pela recepção',
    },
  });

  return updatedCard;
}

/**
 * Resgata uma recompensa do Cartão Fidelidade (ex: 1 Corte Grátis).
 */
export async function redeemReward(
  tenantId: string,
  customerId: string,
  notes?: string,
) {
  const { card, config } = await getCustomerLoyaltyDetails(tenantId, customerId);

  if (card.rewardsAvailable <= 0) {
    throw new Error('Este cliente não possui recompensas disponíveis para resgate no momento.');
  }

  const updatedCard = await prisma.loyaltyCard.update({
    where: { id: card.id },
    data: {
      rewardsAvailable: card.rewardsAvailable - 1,
    },
    include: { customer: true },
  });

  await prisma.loyaltyTransaction.create({
    data: {
      tenantId,
      loyaltyCardId: card.id,
      type: 'REWARD_REDEEMED',
      stampsChange: 0,
      notes: notes || `Resgate de recompensa: ${config.rewardText}`,
    },
  });

  // Notificação via WhatsApp do resgate realizado
  if (config.autoSendWhatsApp) {
    const targetPhone = card.customer.whatsappJid || card.customer.phone;
    if (targetPhone) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      });
      const customerName = card.customer.name.trim().split(/\s+/)[0] || 'Cliente';
      const msg = `🎁 *Parabéns, ${customerName}!* Seu prêmio (*${config.rewardText}*) do Cartão Fidelidade da *${tenant?.name || 'sua barbearia'}* foi resgatado com sucesso!\n\nEsperamos você de volta para o próximo corte! ✂️`;
      whatsAppService.sendMessage(tenantId, targetPhone, msg).catch((err) => {
        logger.warn({ err, tenantId }, 'Aviso ao enviar confirmação de resgate via WhatsApp');
      });
    }
  }

  return updatedCard;
}

/**
 * Processa o acúmulo automático de selo quando um agendamento é concluído (COMPLETED).
 */
export async function processLoyaltyForCompletedAppointment(
  tenantId: string,
  appointmentId: string,
) {
  try {
    const config = await getLoyaltyConfig(tenantId);
    if (!config.enabled) return;

    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      include: {
        customer: true,
        tenant: { select: { name: true, slug: true } },
      },
    });

    if (!appointment || !appointment.customer) return;

    // Busca ou cria o Cartão Fidelidade do cliente
    let card = await prisma.loyaltyCard.findUnique({
      where: { tenantId_customerId: { tenantId, customerId: appointment.customer.id } },
    });

    if (!card) {
      card = await prisma.loyaltyCard.create({
        data: {
          tenantId,
          customerId: appointment.customer.id,
          currentStamps: 0,
          completedCycles: 0,
          rewardsAvailable: 0,
        },
      });
    }

    const nextStamps = card.currentStamps + 1;
    const target = config.targetStamps;
    const hasCompletedCycle = nextStamps >= target;

    const finalStamps = hasCompletedCycle ? 0 : nextStamps;
    const finalCycles = hasCompletedCycle ? card.completedCycles + 1 : card.completedCycles;
    const finalRewards = hasCompletedCycle ? card.rewardsAvailable + 1 : card.rewardsAvailable;

    await prisma.loyaltyCard.update({
      where: { id: card.id },
      data: {
        currentStamps: finalStamps,
        completedCycles: finalCycles,
        rewardsAvailable: finalRewards,
        lastStampAt: new Date(),
      },
    });

    await prisma.loyaltyTransaction.create({
      data: {
        tenantId,
        loyaltyCardId: card.id,
        appointmentId,
        type: 'STAMP_ADDED',
        stampsChange: 1,
        notes: hasCompletedCycle
          ? `Cartão completado com sucesso! Ganhou ${config.rewardText}`
          : `Selo ${nextStamps}/${target} adicionado após agendamento`,
      },
    });

    // Envio automático no WhatsApp
    if (config.autoSendWhatsApp) {
      const targetPhone = appointment.customer.whatsappJid || appointment.customer.phone;
      if (targetPhone) {
        const customerName = appointment.customer.name.trim().split(/\s+/)[0] || 'Cliente';
        const salonName = appointment.tenant.name;
        const vitrineUrl = `https://barberflow.azespo.com.br/${appointment.tenant.slug}`;

        if (hasCompletedCycle) {
          const celebrationMsg = `🎉 *PARABÉNS, ${customerName.toUpperCase()}!*\n\nVocê acabou de completar seus *${target}/${target} selos* no Cartão Fidelidade da *${salonName}*!\n\n🎁 *Seu prêmio liberado:* ${config.rewardText}\n\nMostre esta mensagem no seu próximo atendimento para resgatar. Você merece! ✂️\n\nAcompanhe seu cartão em: ${vitrineUrl}`;
          await whatsAppService.sendMessage(tenantId, targetPhone, celebrationMsg);
        } else {
          const remaining = target - nextStamps;
          const progressMsg = `✂️ *Parabéns, ${customerName}!* Seu corte na *${salonName}* foi concluído e você ganhou *+1 selo* no seu Cartão Fidelidade!\n\n🏆 Você já tem *${nextStamps}/${target} selos* acumulados (faltam apenas ${remaining} para ganhar *${config.rewardText}*).\n\nAcompanhe seu progresso em: ${vitrineUrl}`;
          await whatsAppService.sendMessage(tenantId, targetPhone, progressMsg);
        }
      }
    }

    logger.info(
      { tenantId, appointmentId, customerId: appointment.customer.id, nextStamps, hasCompletedCycle },
      'Selo de fidelidade processado automaticamente com sucesso',
    );
  } catch (err) {
    logger.error({ err, tenantId, appointmentId }, 'Erro ao processar Cartão Fidelidade para agendamento concluído');
  }
}

/**
 * Consulta pública do Cartão Fidelidade pela Vitrine Online (`/[slug]`).
 */
export async function getPublicCustomerLoyalty(slug: string, rawPhone?: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true },
  });

  if (!tenant) {
    throw new Error('Barbearia não encontrada.');
  }

  const config = await getLoyaltyConfig(tenant.id);
  if (!config.enabled || !config.showInPublicShowcase) {
    return { enabled: false, message: 'Programa de fidelidade não disponível no momento.' };
  }

  const cleanDigits = rawPhone ? rawPhone.replace(/\D/g, '') : '';
  if (!cleanDigits) {
    return {
      enabled: true,
      found: false,
      tenantName: tenant.name,
      targetStamps: config.targetStamps,
      rewardText: config.rewardText,
    };
  }

  if (cleanDigits.length < 8) {
    throw new Error('Telefone inválido para consulta.');
  }

  // Busca cliente por telefone (com ou sem DDI 55)
  const phoneVariants = [
    cleanDigits,
    `55${cleanDigits}`,
    cleanDigits.startsWith('55') ? cleanDigits.slice(2) : cleanDigits,
  ];

  const customer = await prisma.customer.findFirst({
    where: {
      tenantId: tenant.id,
      OR: [
        { phone: { in: phoneVariants } },
        { whatsappJid: { in: phoneVariants.map((p) => `${p}@s.whatsapp.net`) } },
      ],
    },
    select: { id: true, name: true },
  });

  if (!customer) {
    return {
      found: false,
      tenantName: tenant.name,
      targetStamps: config.targetStamps,
      rewardText: config.rewardText,
      message: 'Nenhum histórico encontrado para este número. Faça seu primeiro agendamento para começar a pontuar!',
    };
  }

  const card = await prisma.loyaltyCard.findUnique({
    where: { tenantId_customerId: { tenantId: tenant.id, customerId: customer.id } },
  });

  const currentStamps = card?.currentStamps || 0;
  const completedCycles = card?.completedCycles || 0;
  const rewardsAvailable = card?.rewardsAvailable || 0;
  const target = config.targetStamps;
  const remaining = Math.max(0, target - currentStamps);
  const firstName = customer.name.trim().split(/\s+/)[0] || 'Cliente';

  return {
    found: true,
    enabled: true,
    tenantName: tenant.name,
    customerName: firstName,
    targetStamps: target,
    currentStamps,
    remainingStamps: remaining,
    completedCycles,
    rewardsAvailable,
    rewardText: config.rewardText,
    lastStampAt: card?.lastStampAt || null,
  };
}
