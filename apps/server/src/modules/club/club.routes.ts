import { Router } from 'express';
import { z } from 'zod';
import { clubService } from './club.service.js';
import { requireAuth } from '../../middlewares/auth.js';

export const clubRouter = Router();

clubRouter.use(requireAuth);

const planSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do plano').max(100),
  description: z.string().trim().max(1000).optional().nullable(),
  priceCents: z.coerce.number().int().min(1, 'O valor deve ser maior que zero'),
  maxUsagesPerMonth: z.coerce.number().int().min(1).max(100).nullable().optional(),
  allowedDaysOfWeek: z.array(z.coerce.number().int().min(0).max(6)).optional().default([]),
  serviceIds: z.array(z.string().min(1)).min(1, 'Selecione pelo menos um serviço'),
  isActive: z.boolean().optional(),
});

const subscriptionSchema = z.object({
  customerId: z.string().min(1, 'Selecione o cliente'),
  planId: z.string().min(1, 'Selecione o plano'),
  cycleDays: z.coerce.number().int().min(7).max(365).optional().default(30),
  paymentMethod: z.string().optional().default('MANUAL'),
  notes: z.string().trim().max(500).optional().nullable(),
});

/**
 * Estatísticas e KPIs do Clube
 */
clubRouter.get('/stats', async (req, res) => {
  const stats = await clubService.getStats(req.tenantId!);
  res.json(stats);
});

/**
 * Planos do Clube
 */
clubRouter.get('/plans', async (req, res) => {
  const includeInactive = req.query.includeInactive === 'true';
  const plans = await clubService.listPlans(req.tenantId!, includeInactive);
  res.json({ plans });
});

clubRouter.post('/plans', async (req, res) => {
  const data = planSchema.parse(req.body);
  const plan = await clubService.createPlan(req.tenantId!, data);
  res.status(201).json({ plan, message: 'Plano do clube criado com sucesso!' });
});

clubRouter.put('/plans/:id', async (req, res) => {
  const data = planSchema.partial().parse(req.body);
  const plan = await clubService.updatePlan(req.tenantId!, req.params.id, data);
  res.json({ plan, message: 'Plano atualizado com sucesso!' });
});

clubRouter.delete('/plans/:id', async (req, res) => {
  await clubService.deletePlan(req.tenantId!, req.params.id);
  res.json({ success: true, message: 'Plano removido com sucesso!' });
});

/**
 * Assinaturas dos Clientes
 */
clubRouter.get('/subscriptions', async (req, res) => {
  const page = Number(req.query.page) || 1;
  const pageSize = Number(req.query.pageSize) || 20;
  const search = req.query.search ? String(req.query.search) : undefined;
  const status = req.query.status as any;

  const result = await clubService.listSubscriptions(req.tenantId!, {
    page,
    pageSize,
    search,
    status,
  });
  res.json(result);
});

clubRouter.post('/subscriptions', async (req, res) => {
  const data = subscriptionSchema.parse(req.body);
  const subscription = await clubService.createSubscription(req.tenantId!, data);
  res.status(201).json({ subscription, message: 'Cliente cadastrado no Clube com sucesso!' });
});

clubRouter.post('/subscriptions/:id/renew', async (req, res) => {
  const paymentMethod = req.body.paymentMethod ? String(req.body.paymentMethod) : 'MANUAL';
  const subscription = await clubService.renewSubscription(req.tenantId!, req.params.id, paymentMethod);
  res.json({ subscription, message: 'Ciclo da assinatura renovado por mais 30 dias!' });
});

clubRouter.post('/subscriptions/:id/cancel', async (req, res) => {
  const notes = req.body.notes ? String(req.body.notes) : undefined;
  const subscription = await clubService.cancelSubscription(req.tenantId!, req.params.id, notes);
  res.json({ subscription, message: 'Assinatura cancelada com sucesso.' });
});

/**
 * Checagem de Cobertura
 */
clubRouter.get('/check-coverage', async (req, res) => {
  const customerId = String(req.query.customerId);
  const serviceId = String(req.query.serviceId);
  const dateStr = String(req.query.date || new Date().toISOString());

  const result = await clubService.checkCustomerClubCoverage(
    req.tenantId!,
    customerId,
    serviceId,
    new Date(dateStr)
  );
  res.json(result);
});

/**
 * Histórico de Utilizações
 */
clubRouter.get('/usages', async (req, res) => {
  const page = Number(req.query.page) || 1;
  const pageSize = Number(req.query.pageSize) || 20;

  const result = await clubService.listUsages(req.tenantId!, page, pageSize);
  res.json(result);
});
