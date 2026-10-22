import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { assertProfessionalLimit } from '../../lib/tenant-access.js';
import { normalizePhone } from '../../lib/utils.js';
import { requireRole } from '../../middlewares/auth.js';
import { whatsAppService } from '../whatsapp/whatsapp.service.js';

export const professionalsRouter = Router();

const permissionsSchema = z.object({
  preset: z.enum(['ADMIN', 'RECEPTION', 'BARBER', 'FINANCE', 'CUSTOM']).optional(),
  roleTitle: z.string().trim().max(50).optional(),
  allowedMenus: z.array(z.string()).default(['calendar']),
  canViewAllAppointments: z.boolean().default(false),
  canManageAppointments: z.boolean().default(false),
  canManageCustomers: z.boolean().default(false),
  canManageServices: z.boolean().default(false),
  canViewFinancials: z.boolean().default(false),
  canManageFinancials: z.boolean().default(false),
  canManageTeam: z.boolean().default(false),
  canManageSettings: z.boolean().default(false),
});

function determineUserRole(permissions?: z.infer<typeof permissionsSchema>): 'MANAGER' | 'PROFESSIONAL' {
  if (!permissions) return 'PROFESSIONAL';
  if (permissions.preset === 'ADMIN' || permissions.preset === 'RECEPTION' || permissions.preset === 'FINANCE') {
    return 'MANAGER';
  }
  if (permissions.canManageTeam || permissions.canManageSettings || permissions.canManageServices) {
    return 'MANAGER';
  }
  return 'PROFESSIONAL';
}

const professionalSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome').max(80),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.string().email().nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida').optional(),
  commissionPercent: z.number().int().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
  serviceIds: z.array(z.string()).optional(),
  hasLogin: z.boolean().optional(),
  loginEmail: z.string().email('E-mail de login inválido').optional(),
  loginPassword: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres').optional(),
  permissions: permissionsSchema.optional(),
});

const include = {
  services: { select: { serviceId: true } },
  user: { select: { id: true, email: true, role: true, isActive: true, permissions: true } },
} as const;

function serialize(p: Prisma.ProfessionalGetPayload<{ include: typeof include }>) {
  const { services, user, ...rest } = p;
  return {
    ...rest,
    serviceIds: services.map((s) => s.serviceId),
    user: user
      ? {
          id: user.id,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          permissions: (user.permissions as any) || {
            preset: user.role === 'MANAGER' ? 'ADMIN' : 'BARBER',
            allowedMenus: ['calendar'],
            canViewAllAppointments: false,
          },
        }
      : null,
  };
}

async function assertServicesBelongToTenant(tenantId: string, serviceIds?: string[]) {
  if (!serviceIds?.length) return;
  const count = await prisma.service.count({ where: { tenantId, id: { in: serviceIds } } });
  if (count !== new Set(serviceIds).size) throw HttpError.badRequest('Um ou mais serviços são inválidos');
}

professionalsRouter.get('/', async (req, res) => {
  const onlyActive = req.query.active === 'true';
  const professionals = await prisma.professional.findMany({
    where: { tenantId: req.tenantId!, ...(onlyActive ? { isActive: true } : {}) },
    include,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
  res.json({ professionals: professionals.map(serialize) });
});

professionalsRouter.get('/:id', async (req, res) => {
  const professional = await prisma.professional.findFirst({ where: { id: req.params.id as string, tenantId: req.tenantId! }, include });
  if (!professional) throw HttpError.notFound('Profissional não encontrado');
  res.json({ professional: serialize(professional) });
});

function generateProvisionalPassword(): string {
  const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowers = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  let pass = 'Bf@';
  pass += uppers[Math.floor(Math.random() * uppers.length)];
  pass += lowers[Math.floor(Math.random() * lowers.length)];
  pass += lowers[Math.floor(Math.random() * lowers.length)];
  pass += digits[Math.floor(Math.random() * digits.length)];
  pass += digits[Math.floor(Math.random() * digits.length)];
  pass += digits[Math.floor(Math.random() * digits.length)];
  return pass;
}

professionalsRouter.post('/', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const tenantId = req.tenantId!;
  const { serviceIds, hasLogin, loginEmail, loginPassword, permissions, ...data } = professionalSchema.parse(req.body);
  if (data.isActive !== false) await assertProfessionalLimit(tenantId);
  await assertServicesBelongToTenant(tenantId, serviceIds);

  let createdUserId: string | null = null;
  let effectiveProvisionalPassword: string | null = null;

  if (hasLogin) {
    if (!loginEmail) throw HttpError.badRequest('Informe o e-mail de acesso para o profissional');

    const emailNorm = loginEmail.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email: emailNorm } });
    if (existing) throw HttpError.conflict('Já existe um usuário cadastrado com este e-mail');

    effectiveProvisionalPassword = (loginPassword && loginPassword.trim().length >= 6)
      ? loginPassword.trim()
      : generateProvisionalPassword();

    const passwordHash = await bcrypt.hash(effectiveProvisionalPassword, 12);
    const assignedRole = determineUserRole(permissions);
    const userPerms: any = permissions || {
      preset: assignedRole === 'MANAGER' ? 'ADMIN' : 'BARBER',
      allowedMenus: ['calendar'],
      canViewAllAppointments: false,
    };
    userPerms.mustChangePassword = true;

    const user = await prisma.user.create({
      data: {
        tenantId,
        name: data.name,
        email: emailNorm,
        passwordHash,
        role: assignedRole,
        permissions: userPerms,
        isActive: data.isActive !== false,
      },
    });
    createdUserId = user.id;
  }

  const professional = await prisma.professional.create({
    data: {
      ...data,
      email: loginEmail || data.email,
      userId: createdUserId,
      tenantId,
      phone: normalizePhone(data.phone),
      services: serviceIds?.length ? { createMany: { data: serviceIds.map((serviceId) => ({ serviceId })) } } : undefined,
    },
    include,
  });

  res.status(201).json({
    professional: serialize(professional),
    provisionalPassword: effectiveProvisionalPassword,
  });
});

professionalsRouter.patch('/:id', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const tenantId = req.tenantId!;
  const id = req.params.id as string;
  const { serviceIds, hasLogin, loginEmail, loginPassword, permissions, ...data } = professionalSchema.partial().parse(req.body);
  const current = await prisma.professional.findFirst({ where: { id, tenantId }, include: { user: true } });
  if (!current) throw HttpError.notFound('Profissional não encontrado');
  if (data.isActive === true && !current.isActive) await assertProfessionalLimit(tenantId);
  await assertServicesBelongToTenant(tenantId, serviceIds);

  let updatedUserId = current.userId;

  // Gerenciamento de Login e Permissões do Profissional
  if (hasLogin === true) {
    const emailNorm = (loginEmail || current.email || current.user?.email)?.toLowerCase().trim();
    if (!emailNorm) throw HttpError.badRequest('Informe o e-mail de acesso para o profissional');

    if (current.userId && current.user) {
      // Usuário já existe, atualiza dados
      const existingOther = await prisma.user.findFirst({
        where: { email: emailNorm, NOT: { id: current.userId } },
      });
      if (existingOther) throw HttpError.conflict('Já existe outro usuário com este e-mail');

      const userPerms: any = permissions || (current.user.permissions as any) || {};
      const userUpdateData: any = {
        name: data.name || current.name,
        email: emailNorm,
        isActive: data.isActive !== undefined ? data.isActive : true,
      };

      if (permissions) {
        userUpdateData.role = determineUserRole(permissions);
      }
      if (loginPassword && loginPassword.trim().length >= 6) {
        userUpdateData.passwordHash = await bcrypt.hash(loginPassword.trim(), 12);
        userPerms.mustChangePassword = true;
      }
      userUpdateData.permissions = userPerms;

      await prisma.user.update({
        where: { id: current.userId },
        data: userUpdateData,
      });
    } else {
      // Criar usuário para o profissional pela primeira vez
      const existing = await prisma.user.findUnique({ where: { email: emailNorm } });
      if (existing) throw HttpError.conflict('Já existe um usuário cadastrado com este e-mail');

      const effectivePassword = (loginPassword && loginPassword.trim().length >= 6)
        ? loginPassword.trim()
        : generateProvisionalPassword();

      const passwordHash = await bcrypt.hash(effectivePassword, 12);
      const assignedRole = determineUserRole(permissions);
      const userPerms: any = permissions || {
        preset: assignedRole === 'MANAGER' ? 'ADMIN' : 'BARBER',
        allowedMenus: ['calendar'],
        canViewAllAppointments: false,
      };
      userPerms.mustChangePassword = true;

      const user = await prisma.user.create({
        data: {
          tenantId,
          name: data.name || current.name,
          email: emailNorm,
          passwordHash,
          role: assignedRole,
          permissions: userPerms,
          isActive: data.isActive !== undefined ? data.isActive : true,
        },
      });
      updatedUserId = user.id;
    }
  } else if (hasLogin === false && current.userId) {
    // Desativa acesso ao sistema do usuário vinculado
    await prisma.user.update({
      where: { id: current.userId },
      data: { isActive: false },
    });
  }

  if (data.isActive !== undefined && current.userId && hasLogin === undefined) {
    await prisma.user.update({
      where: { id: current.userId },
      data: { isActive: data.isActive },
    }).catch(() => {});
  }

  const professional = await prisma.$transaction(async (tx) => {
    if (serviceIds) {
      await tx.professionalService.deleteMany({ where: { professionalId: current.id } });
      if (serviceIds.length) {
        await tx.professionalService.createMany({ data: serviceIds.map((serviceId) => ({ professionalId: current.id, serviceId })) });
      }
    }
    return tx.professional.update({
      where: { id: current.id },
      data: {
        ...data,
        userId: updatedUserId,
        email: loginEmail !== undefined ? loginEmail : data.email,
        phone: data.phone === undefined ? undefined : normalizePhone(data.phone),
      },
      include,
    });
  });
  res.json({ professional: serialize(professional) });
});

/** Remove definitivamente (se force=true ou sem histórico) ou desativa da equipe (mantendo relatórios). */
professionalsRouter.delete('/:id', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const tenantId = req.tenantId!;
  const id = req.params.id as string;
  const force = req.query.force === 'true';

  const current = await prisma.professional.findFirst({ where: { id, tenantId } });
  if (!current) throw HttpError.notFound('Profissional não encontrado');

  const appointmentsCount = await prisma.appointment.count({ where: { professionalId: current.id } });

  // Se o usuário solicitou exclusão definitiva (force=true) OU se o profissional não tem nenhum agendamento
  if (force || appointmentsCount === 0) {
    await prisma.$transaction(async (tx) => {
      if (appointmentsCount > 0) {
        await tx.appointment.deleteMany({ where: { professionalId: current.id, tenantId } });
      }
      await tx.professionalService.deleteMany({ where: { professionalId: current.id } });
      await tx.professional.delete({ where: { id: current.id } });
      if (current.userId) {
        await tx.user.delete({ where: { id: current.userId } }).catch(() => {});
      }
    });

    return res.json({
      deleted: true,
      deactivated: false,
      message: 'Profissional e histórico excluídos definitivamente com sucesso.',
    });
  }

  // Caso tenha agendamentos e não forçou exclusão: desativa para preservar relatórios e libera vaga no plano
  await prisma.$transaction(async (tx) => {
    await tx.professional.update({ where: { id: current.id }, data: { isActive: false } });
    if (current.userId) {
      await tx.user.update({ where: { id: current.userId }, data: { isActive: false } }).catch(() => {});
    }
  });

  return res.json({
    deleted: false,
    deactivated: true,
    appointmentsCount,
    message: 'Profissional desativado da equipe para preservar o histórico.',
  });
});

const sendInviteSchema = z.object({
  channel: z.enum(['WHATSAPP_BOT', 'WHATSAPP_LINK', 'EMAIL']),
  tempPassword: z.string().optional(),
});

professionalsRouter.post('/:id/send-invite', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const tenantId = req.tenantId!;
  const id = req.params.id as string;
  const { channel, tempPassword } = sendInviteSchema.parse(req.body);

  const prof = await prisma.professional.findFirst({
    where: { id, tenantId },
    include: {
      user: true,
      tenant: { select: { name: true, slug: true } },
    },
  });

  if (!prof) throw HttpError.notFound('Profissional não encontrado');
  if (!prof.user || !prof.user.isActive) {
    throw HttpError.badRequest('Este membro da equipe ainda não possui login ativo no sistema');
  }

  const phone = prof.phone ? normalizePhone(prof.phone) : null;
  const email = prof.user.email || prof.email;
  const salonName = prof.tenant.name;
  const appUrl = req.headers.origin || 'https://barberflow.com.br';
  const loginUrl = `${appUrl}/login`;

  let passwordToUse = tempPassword?.trim();

  // Se não foi informada uma senha provisória, gera uma nova automaticamente e atualiza o usuário no banco com mustChangePassword = true!
  if (!passwordToUse) {
    passwordToUse = generateProvisionalPassword();
    const newHash = await bcrypt.hash(passwordToUse, 12);
    const userPerms = (prof.user.permissions as any) || {};
    userPerms.mustChangePassword = true;
    await prisma.user.update({
      where: { id: prof.user.id },
      data: {
        passwordHash: newHash,
        permissions: userPerms,
      },
    });
  }

  const inviteText = [
    `✂️ Olá, *${prof.name}*!`,
    ``,
    `Você recebeu acesso ao painel do *BarberFlow* na barbearia *${salonName}*.`,
    ``,
    `🔐 *Seus dados de acesso:*`,
    `🌐 *Link do Painel:* ${loginUrl}`,
    `📧 *E-mail:* ${email}`,
    `🔑 *Senha provisória:* ${passwordToUse}`,
    ``,
    `⚠️ *Primeiro Acesso:* Ao fazer login com a senha provisória acima, você deverá cadastrar sua própria senha pessoal definitiva.`,
    ``,
    `Acesse o link acima para visualizar sua agenda e atendimentos!`,
  ].join('\n');

  if (channel === 'WHATSAPP_BOT') {
    if (!phone) throw HttpError.badRequest('O profissional não possui telefone/WhatsApp cadastrado');
    const sent = await whatsAppService.sendMessage(tenantId, phone, inviteText);
    if (!sent) {
      throw HttpError.badRequest('Não foi possível enviar via bot. Verifique se o WhatsApp da barbearia está conectado.');
    }
    return res.json({
      success: true,
      message: 'Convite com senha provisória enviado com sucesso pelo WhatsApp do salão!',
      generatedPassword: passwordToUse,
    });
  }

  const waDigits = phone ? phone.replace(/\D/g, '') : '';
  const waUrl = waDigits ? `https://wa.me/55${waDigits}?text=${encodeURIComponent(inviteText)}` : null;

  return res.json({
    success: true,
    channel,
    inviteText,
    generatedPassword: passwordToUse,
    whatsappUrl: waUrl,
    loginUrl,
    email,
  });
});

