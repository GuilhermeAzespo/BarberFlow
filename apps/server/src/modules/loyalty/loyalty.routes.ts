import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../../lib/http-error.js';
import {
  getLoyaltyConfig,
  updateLoyaltyConfig,
  getLoyaltyDashboardStats,
  listLoyaltyCards,
  getCustomerLoyaltyDetails,
  manualAdjustStamps,
  redeemReward,
} from './loyalty.service.js';

export const loyaltyRouter = Router();

const updateConfigSchema = z.object({
  enabled: z.boolean().optional(),
  targetStamps: z.number().int().min(2).max(50).optional(),
  rewardText: z.string().trim().min(3).max(100).optional(),
  autoSendWhatsApp: z.boolean().optional(),
  showInPublicShowcase: z.boolean().optional(),
});

const manualStampSchema = z.object({
  stampsChange: z.number().int().min(-50).max(50),
  notes: z.string().trim().max(200).optional(),
});

const redeemSchema = z.object({
  notes: z.string().trim().max(200).optional(),
});

// Obtém configuração do Cartão Fidelidade
loyaltyRouter.get('/config', async (req, res) => {
  const config = await getLoyaltyConfig(req.tenantId!);
  res.json({ config });
});

// Atualiza configuração
loyaltyRouter.put('/config', async (req, res) => {
  const data = updateConfigSchema.parse(req.body);
  const updated = await updateLoyaltyConfig(req.tenantId!, data);
  res.json({ config: updated, message: 'Configuração do Cartão Fidelidade salva com sucesso!' });
});

// Dashboard de métricas
loyaltyRouter.get('/stats', async (req, res) => {
  const data = await getLoyaltyDashboardStats(req.tenantId!);
  res.json(data);
});

// Lista cartões fidelidade dos clientes
loyaltyRouter.get('/cards', async (req, res) => {
  const search = req.query.search ? String(req.query.search) : undefined;
  const filter = req.query.filter === 'READY_TO_REDEEM' ? 'READY_TO_REDEEM' : 'ALL';
  const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;

  const result = await listLoyaltyCards(req.tenantId!, {
    search,
    filter,
    page,
    limit,
  });

  res.json(result);
});

// Detalhes do cartão de um cliente com extrato
loyaltyRouter.get('/cards/:customerId', async (req, res) => {
  const { customerId } = req.params;
  const result = await getCustomerLoyaltyDetails(req.tenantId!, customerId);
  res.json(result);
});

// Ajuste manual de selos
loyaltyRouter.post('/cards/:customerId/manual-stamp', async (req, res) => {
  const { customerId } = req.params;
  const data = manualStampSchema.parse(req.body);
  const card = await manualAdjustStamps(req.tenantId!, customerId, data.stampsChange, data.notes);
  res.json({ success: true, card, message: 'Selos atualizados com sucesso!' });
});

// Resgate de prêmio
loyaltyRouter.post('/cards/:customerId/redeem', async (req, res) => {
  const { customerId } = req.params;
  const data = redeemSchema.parse(req.body || {});
  try {
    const card = await redeemReward(req.tenantId!, customerId, data.notes);
    res.json({ success: true, card, message: 'Prêmio resgatado com sucesso!' });
  } catch (err: unknown) {
    throw HttpError.badRequest(err instanceof Error ? err.message : 'Falha ao resgatar recompensa.');
  }
});
