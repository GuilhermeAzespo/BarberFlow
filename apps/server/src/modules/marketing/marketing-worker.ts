import { DateTime } from 'luxon';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { marketingService } from './marketing.service.js';
import { hasPlanFeature } from '../../lib/tenant-access.js';

let workerInterval: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Executa uma rodada da automação de marketing para todos os salões elegíveis.
 */
export async function runMarketingAutomationsCycle() {
  if (isRunning) {
    logger.debug('Ciclo de automação de marketing já em execução, ignorando...');
    return;
  }

  isRunning = true;
  try {
    const activeConfigs = await prisma.marketingConfig.findMany({
      where: {
        enabled: true,
        OR: [{ birthdayEnabled: true }, { inactiveRecoveryEnabled: true }],
      },
      include: {
        tenant: {
          select: { id: true, name: true, slug: true, timezone: true, status: true },
        },
      },
    });

    for (const config of activeConfigs) {
      const tenant = config.tenant;
      if (!tenant || tenant.status !== 'ACTIVE') continue;

      // Verifica se o salão tem a feature 'marketing' liberada no plano ou add-on
      const hasFeature = await hasPlanFeature(tenant.id, 'marketing');
      if (!hasFeature) continue;

      const zone = tenant.timezone || 'America/Sao_Paulo';
      const nowLuxon = DateTime.now().setZone(zone);

      // Checa janela de envio
      const [startH, startM] = (config.sendWindowStart || '09:00').split(':').map(Number);
      const [endH, endM] = (config.sendWindowEnd || '19:00').split(':').map(Number);
      const windowStart = nowLuxon.set({ hour: startH, minute: startM, second: 0 });
      const windowEnd = nowLuxon.set({ hour: endH, minute: endM, second: 0 });

      if (nowLuxon < windowStart || nowLuxon > windowEnd) {
        continue;
      }

      // 1. Processa Aniversariantes de Hoje
      if (config.birthdayEnabled) {
        try {
          const birthdayList = await marketingService.listEligibleBirthdays(tenant.id);
          const eligibleToday = birthdayList.today.filter((b) => b.canSendNow);

          if (eligibleToday.length > 0) {
            logger.info(
              { tenantId: tenant.id, count: eligibleToday.length },
              'Disparando mensagens automáticas de aniversário via WhatsApp'
            );
            await marketingService.sendBatch(
              tenant.id,
              'BIRTHDAY',
              eligibleToday.map((b) => b.id)
            );
          }
        } catch (bErr) {
          logger.warn({ err: bErr, tenantId: tenant.id }, 'Erro ao processar aniversariantes no ciclo automático');
        }
      }

      // 2. Processa Clientes Inativos (apenas se houver cota e for após as 11:00 para não concorrer com aniversários matinais)
      if (config.inactiveRecoveryEnabled && nowLuxon.hour >= 11) {
        try {
          const stats = await marketingService.getStats(tenant.id);
          const remainingDaily = stats.stats.dailyRemainingQuota;

          // Se tem cota disponível e clientes inativos
          if (remainingDaily > 0 && stats.stats.inactiveCount > 0) {
            // Processa até 5 por hora suavemente
            const batchLimit = Math.min(5, remainingDaily);
            logger.info(
              { tenantId: tenant.id, batchLimit },
              'Disparando lote automático de recuperação de clientes inativos'
            );
            await marketingService.sendBatch(tenant.id, 'INACTIVE_RECOVERY');
          }
        } catch (iErr) {
          logger.warn({ err: iErr, tenantId: tenant.id }, 'Erro ao processar recuperação de inativos no ciclo automático');
        }
      }
    }
  } catch (err) {
    logger.error({ err }, 'Erro inesperado no ciclo de automações de marketing');
  } finally {
    isRunning = false;
  }
}

/**
 * Inicializa o worker em segundo plano a cada 1 hora.
 */
export function initMarketingWorker() {
  if (workerInterval) return;

  // Executa primeira rodada após 1 minuto do boot
  setTimeout(() => {
    runMarketingAutomationsCycle().catch((err) => {
      logger.error({ err }, 'Falha na inicialização do worker de marketing');
    });
  }, 60 * 1000);

  // Intervalo a cada 60 minutos
  workerInterval = setInterval(() => {
    runMarketingAutomationsCycle().catch((err) => {
      logger.error({ err }, 'Falha no worker de marketing periódico');
    });
  }, 60 * 60 * 1000);

  logger.info('Worker de Automação de Marketing & Retorno iniciado (intervalo de 60m)');
}
