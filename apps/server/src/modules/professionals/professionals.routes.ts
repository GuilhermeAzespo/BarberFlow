import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { assertProfessionalLimit } from '../../lib/tenant-access.js';
import { normalizePhone } from '../../lib/utils.js';
import { requireRole } from '../../middlewares/auth.js';

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

professionalsRouter.post('/', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const tenantId = req.tenantId!;
  const { serviceIds, hasLogin, loginEmail, loginPassword, permissions, ...data } = professionalSchema.parse(req.body);
  if (data.isActive !== false) await assertProfessionalLimit(tenantId);
  await assertServicesBelongToTenant(tenantId, serviceIds);

  let createdUserId: string | null = null;

  if (hasLogin) {
    if (!loginEmail) throw HttpError.badRequest('Informe o e-mail de acesso para o profissional');
    if (!loginPassword) throw HttpError.badRequest('Informe a senha de acesso para o profissional');

    const emailNorm = loginEmail.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email: emailNorm } });
    if (existing) throw HttpError.conflict('Já existe um usuário cadastrado com este e-mail');

    const passwordHash = await bcrypt.hash(loginPassword, 12);
    const assignedRole = determineUserRole(permissions);
    const user = await prisma.user.create({
      data: {
        tenantId,
        name: data.name,
        email: emailNorm,
        passwordHash,
        role: assignedRole,
        permissions: (permissions as any) || {
          preset: assignedRole === 'MANAGER' ? 'ADMIN' : 'BARBER',
          allowedMenus: ['calendar'],
          canViewAllAppointments: false,
        },
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

  res.status(201).json({ professional: serialize(professional) });
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

      const userUpdateData: any = {
        name: data.name || current.name,
        email: emailNorm,
        isActive: data.isActive !== undefined ? data.isActive : true,
      };

      if (permissions) {
        userUpdateData.permissions = permissions;
        userUpdateData.role = determineUserRole(permissions);
      }
      if (loginPassword && loginPassword.trim().length >= 6) {
        userUpdateData.passwordHash = await bcrypt.hash(loginPassword, 12);
      }

      await prisma.user.update({
        where: { id: current.userId },
        data: userUpdateData,
      });
    } else {
      // Criar usuário para o profissional pela primeira vez
      if (!loginPassword) throw HttpError.badRequest('Defina uma senha inicial para o profissional');
      const existing = await prisma.user.findUnique({ where: { email: emailNorm } });
      if (existing) throw HttpError.conflict('Já existe um usuário cadastrado com este e-mail');

      const passwordHash = await bcrypt.hash(loginPassword, 12);
      const assignedRole = determineUserRole(permissions);
      const user = await prisma.user.create({
        data: {
          tenantId,
          name: data.name || current.name,
          email: emailNorm,
          passwordHash,
          role: assignedRole,
          permissions: (permissions as any) || {
            preset: assignedRole === 'MANAGER' ? 'ADMIN' : 'BARBER',
            allowedMenus: ['calendar'],
            canViewAllAppointments: false,
          },
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

/** Remove se não houver histórico; caso contrário apenas desativa (preserva relatórios). */
professionalsRouter.delete('/:id', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const tenantId = req.tenantId!;
  const id = req.params.id as string;
  const current = await prisma.professional.findFirst({ where: { id, tenantId } });
  if (!current) throw HttpError.notFound('Profissional não encontrado');

  // Se tiver usuário vinculado, desativa o usuário
  if (current.userId) {
    await prisma.user.update({ where: { id: current.userId }, data: { isActive: false } }).catch(() => {});
  }

  const appointments = await prisma.appointment.count({ where: { professionalId: current.id } });
  if (appointments > 0) {
    await prisma.professional.update({ where: { id: current.id }, data: { isActive: false } });
    return res.json({ deleted: false, deactivated: true });
  }
  await prisma.professional.delete({ where: { id: current.id } });
  res.json({ deleted: true, deactivated: false });
});
