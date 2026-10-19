import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { normalizePhone } from '../../lib/utils.js';
import { whatsAppService } from './whatsapp.service.js';
import { requireRole } from '../../middlewares/auth.js';

export const whatsAppRouter = Router();

const updateConfigSchema = z.object({
  botEnabled: z.boolean().optional(),
  welcomeMessage: z.string().trim().min(5).optional(),
  confirmationMessage: z.string().trim().min(5).optional(),
  reminderMessage: z.string().trim().min(5).optional(),
  cancellationMessage: z.string().trim().min(5).optional(),
  reminderEnabled: z.boolean().optional(),
  reminderHoursBefore: z.number().int().min(1).max(48).optional(),
});

const sendTestSchema = z.object({
  phone: z.string().trim().min(8, 'Informe o número de telefone'),
  message: z.string().trim().min(1, 'Mensagem não pode ser vazia'),
});

// Status da conexão e QR code
whatsAppRouter.get('/status', async (req, res) => {
  const tenantId = req.tenantId!;
  const conn = whatsAppService.getConnection(tenantId);
  const config = await prisma.whatsAppConfig.findUnique({ where: { tenantId } });

  res.json({
    status: conn.status !== 'DISCONNECTED' ? conn.status : (config?.status ?? 'DISCONNECTED'),
    qrCode: conn.qrCode,
    qrDataUrl: conn.qrDataUrl,
    phoneNumber: conn.phoneNumber || config?.phoneNumber,
    lastConnectedAt: config?.lastConnectedAt,
    lastDisconnectedAt: config?.lastDisconnectedAt,
    lastError: config?.lastError,
  });
});

// Solicitar conexão / geração de QR Code
whatsAppRouter.post('/connect', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const tenantId = req.tenantId!;
  const conn = await whatsAppService.connectTenant(tenantId);

  res.json({
    status: conn.status,
    qrDataUrl: conn.qrDataUrl,
    phoneNumber: conn.phoneNumber,
  });
});

// Desconectar / Deslogar número
whatsAppRouter.post('/disconnect', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const tenantId = req.tenantId!;
  await whatsAppService.disconnectTenant(tenantId);
  res.json({ success: true, status: 'DISCONNECTED' });
});

// Buscar configurações de mensagens automáticas
whatsAppRouter.get('/config', async (req, res) => {
  const tenantId = req.tenantId!;
  const config = await prisma.whatsAppConfig.findUnique({
    where: { tenantId },
  });
  if (!config) throw HttpError.notFound('Configuração do WhatsApp não encontrada');
  res.json({ config });
});

// Atualizar mensagens e regras do bot
whatsAppRouter.patch('/config', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const data = updateConfigSchema.parse(req.body);
  const tenantId = req.tenantId!;

  const config = await prisma.whatsAppConfig.update({
    where: { tenantId },
    data,
  });

  res.json({ config });
});

// Envio de mensagem de teste
whatsAppRouter.post('/send-test', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const { phone, message } = sendTestSchema.parse(req.body);
  const tenantId = req.tenantId!;

  const normalized = normalizePhone(phone);
  if (!normalized) throw HttpError.badRequest('Número de telefone inválido');

  const sent = await whatsAppService.sendMessage(tenantId, normalized, message);
  if (!sent) {
    throw HttpError.badRequest('Não foi possível enviar a mensagem. Verifique se o WhatsApp está conectado.');
  }

  res.json({ success: true, message: 'Mensagem de teste enviada com sucesso!' });
});
