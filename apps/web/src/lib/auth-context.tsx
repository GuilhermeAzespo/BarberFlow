'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { api, ApiError } from './api';

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
  mustChangePassword?: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'SUPER_ADMIN' | 'OWNER' | 'MANAGER' | 'PROFESSIONAL';
  tenantId?: string | null;
  permissions?: UserPermissions | null;
  professional?: { id: string; name: string; color?: string; serviceIds?: string[] } | null;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  customDomain?: string | null;
  logoUrl?: string | null;
  phone?: string | null;
  address?: string | null;
  timezone: string;
  currency: string;
  slotIntervalMinutes: number;
  onboardingCompleted: boolean;
  status: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED' | 'CANCELED';
}

export interface PlanPermissions {
  reports: boolean;              // Central de Relatórios & Inteligência (/reports)
  satisfactionSurveys: boolean;  // Pesquisas de Satisfação automatizadas (CSAT e NPS)
  customBotMessages: boolean;    // Personalização de mensagens e templates do WhatsApp
  financialExport: boolean;      // Exportação de relatórios financeiros e CSV
  customDomain: boolean;         // Domínio Próprio & DNS Personalizado
  commissions: boolean;          // Rateio e comissões automáticas por barbeiro
  multiUserRoles: boolean;       // Múltiplos perfis de acesso da equipe (Recepção, Barbeiro, Gerente)
  prioritySupport: boolean;      // Suporte VIP Prioritário no WhatsApp
}

export interface Subscription {
  status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
  trialEndsAt?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  lastPaymentAt?: string | null;
  isTrial?: boolean;
  trialDaysLeft?: number | null;
  renewDaysLeft?: number | null;
  plan: {
    id: string;
    name: string;
    slug: string;
    priceCents: number;
    features?: string[];
    permissions?: PlanPermissions;
  };
  limits: {
    maxProfessionals: number | null;
    maxAppointmentsPerMonth: number | null;
    whatsappEnabled: boolean;
    permissions?: PlanPermissions;
  };
}

export interface AccessStatus {
  allowed: boolean;
  code: string;
  message: string;
  warning?: string;
}

interface AuthContextType {
  user: User | null;
  tenant: Tenant | null;
  subscription: Subscription | null;
  access: AccessStatus | null;
  isImpersonated: boolean;
  loading: boolean;
  canAccessMenu: (menuKey: string) => boolean;
  hasPermission: (key: keyof Omit<UserPermissions, 'allowedMenus' | 'preset' | 'roleTitle'>) => boolean;
  hasPlanFeature: (feature: keyof PlanPermissions) => boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  exitImpersonation: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  tenant: null,
  subscription: null,
  access: null,
  isImpersonated: false,
  loading: true,
  canAccessMenu: () => true,
  hasPermission: () => true,
  hasPlanFeature: () => true,
  refresh: async () => {},
  logout: async () => {},
  exitImpersonation: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [access, setAccess] = useState<AccessStatus | null>(null);
  const [isImpersonated, setIsImpersonated] = useState(false);
  const [loading, setLoading] = useState(true);

  const router = useRouter();
  const pathname = usePathname();

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<{
        user: User;
        tenant: Tenant | null;
        subscription: Subscription | null;
        access: AccessStatus;
        isImpersonated?: boolean;
      }>('/api/auth/me');

      setUser(res.user);
      setTenant(res.tenant);
      setSubscription(res.subscription);
      setAccess(res.access);
      setIsImpersonated(Boolean(res.isImpersonated));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        setTenant(null);
        setSubscription(null);
        setAccess(null);
        setIsImpersonated(false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      // Ignora erro no logout
    }
    setUser(null);
    setTenant(null);
    setSubscription(null);
    setAccess(null);
    setIsImpersonated(false);
    router.push('/');
  };

  const exitImpersonation = async () => {
    try {
      await api.post('/api/auth/exit-impersonation');
      setIsImpersonated(false);
      window.location.href = '/admin';
    } catch (err) {
      console.error('Falha ao encerrar personificação:', err);
      setIsImpersonated(false);
      window.location.href = '/admin';
    }
  };

  const canAccessMenu = useCallback(
    (menuKey: string): boolean => {
      if (!user) return false;
      if (user.role === 'SUPER_ADMIN' || user.role === 'OWNER') return true;
      const allowed = user.permissions?.allowedMenus;
      if (!allowed || !Array.isArray(allowed)) return false;
      return allowed.includes(menuKey);
    },
    [user]
  );

  const hasPermission = useCallback(
    (key: keyof Omit<UserPermissions, 'allowedMenus' | 'preset' | 'roleTitle'>): boolean => {
      if (!user) return false;
      if (user.role === 'SUPER_ADMIN' || user.role === 'OWNER') return true;
      return Boolean(user.permissions?.[key]);
    },
    [user]
  );

  const hasPlanFeature = useCallback(
    (feature: keyof PlanPermissions): boolean => {
      if (!user) return false;
      if (user.role === 'SUPER_ADMIN') return true;

      const limitsPerms = subscription?.limits?.permissions;
      if (limitsPerms && limitsPerms[feature] !== undefined) {
        return Boolean(limitsPerms[feature]);
      }
      const planPerms = subscription?.plan?.permissions;
      if (planPerms && planPerms[feature] !== undefined) {
        return Boolean(planPerms[feature]);
      }

      const slug = (subscription?.plan?.slug || 'starter').toLowerCase();
      if (slug === 'premium' || slug === 'master') return true;
      if (slug === 'pro') return feature !== 'customDomain';
      return false;
    },
    [user, subscription]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        tenant,
        subscription,
        access,
        isImpersonated,
        loading,
        canAccessMenu,
        hasPermission,
        hasPlanFeature,
        refresh,
        logout,
        exitImpersonation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
