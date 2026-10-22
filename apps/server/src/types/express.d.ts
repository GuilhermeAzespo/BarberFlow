import type { UserRole } from '@prisma/client';

export interface UserPermissions {
  preset?: 'ADMIN' | 'RECEPTION' | 'BARBER' | 'FINANCE' | 'CUSTOM';
  roleTitle?: string;
  allowedMenus?: string[];
  canViewAllAppointments?: boolean;
  canManageAppointments?: boolean;
  canManageCustomers?: boolean;
  canManageServices?: boolean;
  canViewFinancials?: boolean;
  canManageFinancials?: boolean;
  canManageTeam?: boolean;
  canManageSettings?: boolean;
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
