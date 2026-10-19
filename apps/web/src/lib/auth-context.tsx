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
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  tenant: null,
  subscription: null,
  access: null,
  loading: true,
  refresh: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [access, setAccess] = useState<AccessStatus | null>(null);
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
      }>('/api/auth/me');

      setUser(res.user);
      setTenant(res.tenant);
      setSubscription(res.subscription);
      setAccess(res.access);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        setTenant(null);
        setSubscription(null);
        setAccess(null);
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
    router.push('/login');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        tenant,
        subscription,
        access,
        loading,
        refresh,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
