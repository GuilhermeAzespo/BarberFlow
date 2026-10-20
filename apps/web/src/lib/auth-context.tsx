'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { api, ApiError } from './api';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'SUPER_ADMIN' | 'OWNER' | 'MANAGER' | 'PROFESSIONAL';
  tenantId?: string | null;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  phone?: string | null;
  address?: string | null;
  timezone: string;
  currency: string;
  slotIntervalMinutes: number;
  onboardingCompleted: boolean;
  status: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED' | 'CANCELED';
}

export interface Subscription {
  status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  plan: {
    id: string;
    name: string;
    slug: string;
    priceCents: number;
  };
  limits: {
    maxProfessionals: number | null;
    maxAppointmentsPerMonth: number | null;
    whatsappEnabled: boolean;
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
      await refresh();
      router.push('/admin');
    } catch (err) {
      console.error('Falha ao encerrar personificação:', err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        tenant,
        subscription,
        access,
        isImpersonated,
        loading,
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
