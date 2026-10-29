import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import { env, isProduction, corsOrigins } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { DEFAULT_PLANS } from './lib/defaults.js';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';
import { requireAuth, requireSuperAdmin, requireTenant, requireMenuPermission } from './middlewares/auth.js';

// Rotas dos módulos
import { authRouter } from './modules/auth/auth.routes.js';
import { publicRouter } from './modules/public/public.routes.js';
import { tenantRouter } from './modules/tenant/tenant.routes.js';
import { professionalsRouter } from './modules/professionals/professionals.routes.js';
import { servicesRouter } from './modules/services/services.routes.js';
import { customersRouter } from './modules/customers/customers.routes.js';
import { appointmentsRouter } from './modules/appointments/appointments.routes.js';
import { financeRouter } from './modules/finance/finance.routes.js';
import { whatsAppRouter } from './modules/whatsapp/whatsapp.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { superAdminRouter } from './modules/superadmin/superadmin.routes.js';
import { billingRouter } from './modules/billing/billing.routes.js';
import { reportsRouter } from './modules/reports/reports.routes.js';
import { webhooksRouter } from './modules/webhooks/webhooks.routes.js';
import { whatsAppService } from './modules/whatsapp/whatsapp.service.js';

const app = express();

// Confia no proxy reverso (Traefik no Easypanel, Nginx, Cloudflare)
app.set('trust proxy', 1);

// Middlewares essenciais de segurança e parsing
app.use(
  helmet({
    contentSecurityPolicy: false, // O frontend gerencia sua própria política de CSP
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Permite requisições sem origin (curl/proxy interno Next.js) ou mesma origem se CORS_ORIGIN não estiver restrito
      if (!origin || corsOrigins.length === 0 || corsOrigins.includes(origin) || !isProduction) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  }),
);

app.use(cookieParser());
app.use(express.json({ limit: '5mb' }));

// Healthcheck para Easypanel / Docker
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'error', database: 'disconnected', error: String(err) });
  }
});

// Rotas públicas e de autenticação
app.use('/api/public', publicRouter);
app.use('/api/auth', authRouter);
app.use('/api/webhooks', webhooksRouter);

// Rotas do painel do salão (requer login + contexto do tenant + permissão granular de menu)
app.use('/api/tenant', requireAuth, requireTenant, tenantRouter);
app.use('/api/professionals', requireAuth, requireTenant, professionalsRouter);
app.use('/api/services', requireAuth, requireTenant, servicesRouter);
app.use('/api/customers', requireAuth, requireTenant, requireMenuPermission('customers'), customersRouter);
app.use('/api/appointments', requireAuth, requireTenant, appointmentsRouter);
app.use('/api/finance', requireAuth, requireTenant, requireMenuPermission('finance'), financeRouter);
app.use('/api/whatsapp', requireAuth, requireTenant, requireMenuPermission('whatsapp'), whatsAppRouter);
app.use('/api/dashboard', requireAuth, requireTenant, requireMenuPermission('dashboard'), dashboardRouter);
app.use('/api/reports', requireAuth, requireTenant, requireMenuPermission('reports'), reportsRouter);
app.use('/api/billing', requireAuth, requireTenant, billingRouter);

// Rotas do Super Admin do SaaS
app.use('/api/superadmin', requireSuperAdmin, superAdminRouter);

// Handlers de erro
app.use(notFoundHandler);
app.use(errorHandler);

// Inicialização e Seed automático
async function bootstrap() {
  logger.info('Iniciando inicialização do sistema...');

  // 1. Cria ou sincroniza planos padrão se não existirem
  for (const planData of DEFAULT_PLANS) {
    const existing = await prisma.plan.findUnique({ where: { slug: planData.slug } });
    if (!existing) {
      await prisma.plan.create({ data: planData });
    } else {
      await prisma.plan.update({
        where: { id: existing.id },
        data: {
          sortOrder: planData.sortOrder,
          features: planData.features,
          badge: planData.badge,
          isHighlighted: planData.isHighlighted,
          description: existing.description || planData.description,
          priceCents: planData.priceCents,
          maxProfessionals: planData.maxProfessionals,
          maxAppointmentsPerMonth: planData.maxAppointmentsPerMonth,
        },
      });
    }
  }

  // 2. Cria ou sincroniza Super Admin se configurado no ambiente
  if (env.SUPER_ADMIN_EMAIL && env.SUPER_ADMIN_PASSWORD) {
    const normalizedEmail = env.SUPER_ADMIN_EMAIL.toLowerCase().trim();
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    const passwordHash = await bcrypt.hash(env.SUPER_ADMIN_PASSWORD, 12);

    if (!existingUser) {
      await prisma.user.create({
        data: {
          name: env.SUPER_ADMIN_NAME,
          email: normalizedEmail,
          passwordHash,
          role: 'SUPER_ADMIN',
          isActive: true,
        },
      });
      logger.info({ email: normalizedEmail }, 'Super Admin inicial criado com sucesso');
    } else {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name: env.SUPER_ADMIN_NAME,
          passwordHash,
          role: 'SUPER_ADMIN',
          isActive: true,
        },
      });
      logger.info({ email: normalizedEmail }, 'Super Admin sincronizado com credenciais do ambiente');
    }
  }

  // 3. Inicializa rotinas do WhatsApp
  if (env.WHATSAPP_ENABLED) {
    whatsAppService.init();
    logger.info('Serviço de WhatsApp inicializado');
  }

  const server = app.listen(env.PORT, () => {
    logger.info(`🚀 BarberFlow Server rodando na porta ${env.PORT} [${env.NODE_ENV}]`);
  });

  // Tratamento de encerramento seguro (Tini / Easypanel)
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Encerrando servidor com segurança...');
    server.close(async () => {
      await prisma.$disconnect();
      logger.info('Conexões com banco encerradas. Tchau!');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Falha crítica ao iniciar BarberFlow Server');
  process.exit(1);
});
