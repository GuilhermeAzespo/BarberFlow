import type { UserRole } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        tenantId: string | null;
        role: UserRole;
        impersonatedBy?: string | null;
      };
      /** Preenchido por `requireTenant` — sempre use este valor para escopo multi-tenant. */
      tenantId?: string;
    }
  }
}

export {};
