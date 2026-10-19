import { z } from 'zod';

const booleanFromEnv = z
  .union([z.boolean(), z.string()])
  .transform((value) => (typeof value === 'boolean' ? value : ['true', '1', 'yes', 'on'].includes(value.toLowerCase())));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter pelo menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  COOKIE_SECURE: booleanFromEnv.default(false),
  CORS_ORIGIN: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRIAL_DAYS: z.coerce.number().int().min(0).default(14),
  BILLING_GRACE_DAYS: z.coerce.number().int().min(0).default(5),
  WHATSAPP_ENABLED: booleanFromEnv.default(true),
  SUPER_ADMIN_NAME: z.string().default('Super Admin'),
  SUPER_ADMIN_EMAIL: z.email().optional(),
  SUPER_ADMIN_PASSWORD: z.string().min(8).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`❌ Variáveis de ambiente inválidas:\n${details}`);
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
export const corsOrigins = (env.CORS_ORIGIN ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
