import { Router } from 'express';
import { z } from 'zod';
import { marketingService } from './marketing.service.js';
import { requireAuth } from '../../middlewares/auth.js';
import { HttpError } from '../../lib/http-error.js';

export const marketingRouter = Router();

marketingRouter.use(requireAuth);

const updateConfigSchema = z.object({
  enabled: z.boolean().optional(),
  inactiveRecoveryEnabled: z.boolean().optional(),
  inactiveDaysThreshold: z.coerce.number().int().min(5).max(180).optional(),
  inactiveMessageTemplate: z.string().trim().min(10).max(1000).optional(),
  inactiveDiscountPercent: z.coerce.number().int().min(0).max(90).nullable().optional(),
  birthdayEnabled: z.boolean().optional(),
  birthdayMessageTemplate: z.string().trim().min(10).max(1000).optional(),
  birthdayDiscountPercent: z.coerce.number().int().min(0).max(90).nullable().optional(),
  sendWindowStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  sendWindowEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  minDaysBetweenMessages: z.coerce.number().int().min(1).max(90).optional(),
  maxDailyDispatches: z.coerce.number().int().min(1).max(100).optional(),
});

/**
 * Consulta configuração da barbearia
 */
marketingRouter.get('/config', async (req, res) => {
  const config = await marketingService.getConfig(req.tenantId!);
  res.json({ config });
});

/**
 * Atualiza configurações
 */
marketingRouter.put('/config', async (req, res) => {
  const data = updateConfigSchema.parse(req.body);
  const config = await marketingService.updateConfig(req.tenantId!, data);
  res.json({ config, message: 'Configurações de marketing salvas com sucesso!' });
});

/**
 * Métricas e KPIs
 */
marketingRouter.get('/stats', async (req, res) => {
  const stats = await marketingService.getStats(req.tenantId!);
  res.json(stats);
});

/**
 * Lista de clientes inativos elegíveis
 */
marketingRouter.get('/inactive', async (req, res) => {
  const page = Number(req.query.page) || 1;
  const pageSize = Number(req.query.pageSize) || 20;
  const search = req.query.search ? String(req.query.search) : undefined;

  const result = await marketingService.listEligibleInactive(req.tenantId!, page, pageSize, search);
  res.json(result);
});

/**
 * Lista de aniversariantes
 */
marketingRouter.get('/birthdays', async (req, res) => {
  const result = await marketingService.listEligibleBirthdays(req.tenantId!);
  res.json(result);
});

/**
 * Envio individual
 */
marketingRouter.post('/send-single', async (req, res) => {
  const schema = z.object({
    customerId: z.string().min(1),
    type: z.enum(['INACTIVE_RECOVERY', 'BIRTHDAY']),
    customMessage: z.string().trim().min(5).max(1000).optional(),
  });
  const { customerId, type, customMessage } = schema.parse(req.body);

  const result = await marketingService.sendSingle(req.tenantId!, customerId, type, customMessage);
  res.json(result);
});

/**
 * Envio em lote
 */
marketingRouter.post('/send-batch', async (req, res) => {
  const schema = z.object({
    type: z.enum(['INACTIVE_RECOVERY', 'BIRTHDAY']),
    customerIds: z.array(z.string()).optional(),
  });
  const { type, customerIds } = schema.parse(req.body);

  const result = await marketingService.sendBatch(req.tenantId!, type, customerIds);
  res.json(result);
});

/**
 * Envio de teste
 */
marketingRouter.post('/send-test', async (req, res) => {
  const schema = z.object({
    phone: z.string().min(8),
    type: z.enum(['INACTIVE_RECOVERY', 'BIRTHDAY']).default('INACTIVE_RECOVERY'),
  });
  const { phone, type } = schema.parse(req.body);

  const result = await marketingService.sendTestMessage(req.tenantId!, phone, type);
  res.json(result);
});

/**
 * Histórico de disparos
 */
marketingRouter.get('/logs', async (req, res) => {
  const page = Number(req.query.page) || 1;
  const pageSize = Number(req.query.pageSize) || 20;
  const type = req.query.type as any;

  const result = await marketingService.listLogs(req.tenantId!, page, pageSize, type);
  res.json(result);
});
