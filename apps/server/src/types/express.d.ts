import type { UserRole } from '@prisma/client';

export interface UserPermissions {
  allowedMenus?: string[];
  canViewAllAppointments?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        tenantId: string | null;
        role: UserRole;
        permissions?: UserPermissions | null;
        professionalId?: string | null;
        impersonatedBy?: string | null;
      };
      /** Preenchido por `requireTenant` — sempre use este valor para escopo multi-tenant. */
      tenantId?: string;
    }
  }
}

export {};
