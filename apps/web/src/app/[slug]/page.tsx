'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Calendar as CalendarIcon,
  Clock,
  User as UserIcon,
  Scissors,
  Check,
  Sparkles,
  MapPin,
  Phone,
  MessageSquare,
  ArrowRight,
  Instagram,
  CheckCircle2,
  AlertCircle,
  Globe,
  Share2,
  ExternalLink,
  ChevronRight,
  Shield,
  Star,
  X,
  Camera,
  Flame,
  Tag,
  Repeat,
  Award,
  Gift,
  Search,
  RefreshCw,
  Trophy,
  Crown,
} from 'lucide-react';
import { api } from '../../lib/api';

interface Service {
  id: string;
  name: string;
  description?: string | null;
  durationMinutes: number;
  priceCents: number;
  promoPriceCents?: number | null;
  promoTitle?: string | null;
  promoActive?: boolean;
  promoExpiresAt?: string | null;
  promoDaysOfWeek?: number[];
  isPromoActiveToday?: boolean;
}

interface Professional {
  id: string;
  name: string;
  color: string;
  avatarUrl?: string | null;
  services: { serviceId: string }[];
}

interface BusinessHour {
  id?: string;
  weekday: number;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

interface GalleryItem {
  id: string;
  title?: string | null;
  sortOrder: number;
  url: string;
}

interface TenantPublic {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  coverUrl?: string | null;
  bio?: string | null;
  instagram?: string | null;
  phone?: string | null;
  address?: string | null;
  timezone: string;
  slotIntervalMinutes: number;
  businessHours: BusinessHour[];
  services: Service[];
  professionals: Professional[];
  gallery?: GalleryItem[];
}


interface PublicLoyaltyResponse {
  enabled: boolean;
  found?: boolean;
  tenantName?: string;
  customerName?: string;
  targetStamps?: number;
  currentStamps?: number;
  remainingStamps?: number;
  completedCycles?: number;
  rewardsAvailable?: number;
  rewardText?: string;
  lastStampAt?: string | null;
  message?: string;
}

interface PublicClubPlan {
  id: string;
  name: string;
  description?: string | null;
  priceCents: number;
  maxUsagesPerMonth?: number | null;
  allowedDaysOfWeek?: number[];
  services: {
    service: {
      id: string;
      name: string;
      priceCents: number;
      durationMinutes: number;
    };
  }[];
}

interface PublicClubResponse {
  tenantName: string;
  phone?: string | null;
  plans: PublicClubPlan[];
}

interface PublicCustomerClubSubResponse {
  found: boolean;
  message?: string;
  subscription?: {
    id: string;
    customerName: string;
    planName: string;
    priceCents: number;
    status: string;
    cycleStartDate: string;
    cycleEndDate: string;
    usagesCount: number;
    maxUsagesPerMonth: number | null;
    autoRenew: boolean;
    paymentMethod: string | null;
    services: string[];
  };
}

const RESERVED_SLUGS = [
  'login',
  'register',
  'admin',
  'dashboard',
  'calendar',
  'professionals',
  'services',
  'customers',
  'finance',
  'whatsapp',
  'settings',
  'onboarding',
  'api',
];

const WEEKDAY_NAMES = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function TenantHomePage() {
  const params = useParams();
  const paramSlug = (params?.slug as string) || '';
  const [tenant, setTenant] = useState<TenantPublic | null>(null);
  const slug = paramSlug || tenant?.slug || '';
  const isCustomDomainHost =
    typeof window !== 'undefined' &&
    !['barberflow.azespo.com.br', 'azespo.com.br', 'www.azespo.com.br', 'localhost', '127.0.0.1'].includes(
      window.location.hostname.trim().toLowerCase()
    ) &&
    !window.location.hostname.startsWith('192.168.');
  const homeHref = isCustomDomainHost || !paramSlug ? '/' : `/${slug}`;
  const bookingBaseHref = isCustomDomainHost || !paramSlug ? '/agendar' : `/${slug}/agendar`;
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activePhoto, setActivePhoto] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>('');
  const [loyaltyProgram, setLoyaltyProgram] = useState<PublicLoyaltyResponse | null>(null);
  const [loyaltyPhone, setLoyaltyPhone] = useState('');
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);
  const [loyaltyResult, setLoyaltyResult] = useState<PublicLoyaltyResponse | null>(null);
  const [loyaltySearched, setLoyaltySearched] = useState(false);
  const [clubPlans, setClubPlans] = useState<PublicClubPlan[]>([]);
  const [clubSubPhone, setClubSubPhone] = useState('');
  const [clubSubLoading, setClubSubLoading] = useState(false);
  const [clubSubSearched, setClubSubSearched] = useState(false);
  const [clubSubResult, setClubSubResult] = useState<PublicCustomerClubSubResponse | null>(null);
  const [togglingClubAutoRenew, setTogglingClubAutoRenew] = useState(false);
  const [clubAutoRenewFeedback, setClubAutoRenewFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sectionIds = ['servicos', 'equipe', 'clube', 'fidelidade', 'galeria', 'sobre'];

    const handleScroll = () => {
      if (window.scrollY < 220) {
        setActiveSection('');
        return;
      }
      let current = '';
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 160) {
            current = id;
          }
        }
      }
      // Se chegou ao fim da página, destaca a última seção visível
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 60) {
        for (let i = sectionIds.length - 1; i >= 0; i--) {
          if (document.getElementById(sectionIds[i])) {
            current = sectionIds[i];
            break;
          }
        }
      }
      if (current) setActiveSection(current);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [tenant]);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    e.preventDefault();
    setActiveSection(sectionId);
    const el = document.getElementById(sectionId);
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 82;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const fetchTenant = async () => {
      try {
        setLoading(true);
        if (paramSlug) {
          if (RESERVED_SLUGS.includes(paramSlug.toLowerCase())) {
            setNotFound(true);
            return;
          }
          const res = await api.get<{ tenant: TenantPublic }>(`/api/public/tenants/by-slug/${paramSlug}`);
          setTenant(res.tenant);
          if (res.tenant?.name && typeof document !== 'undefined') {
            document.title = `${res.tenant.name} — Agendamento Online`;
          }
        } else if (typeof window !== 'undefined') {
          const host = window.location.hostname.trim().toLowerCase();
          const res = await api.get<{ tenant: TenantPublic }>(
            `/api/public/tenants/by-domain/${encodeURIComponent(host)}`
          );
          setTenant(res.tenant);
          if (res.tenant?.name && typeof document !== 'undefined') {
            document.title = `${res.tenant.name} — Agendamento Online`;
          }
        } else {
          setNotFound(true);
        }
      } catch (err) {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    fetchTenant();
  }, [paramSlug]);

  // Today's business hours
  const todaySchedule = useMemo(() => {
    if (!tenant?.businessHours) return null;
    const currentWeekday = new Date().getDay();
    const today = tenant.businessHours.find((h) => h.weekday === currentWeekday);
    if (!today || !today.isOpen) return { isOpen: false, text: 'Fechado hoje' };
    return {
      isOpen: true,
      text: `Aberto hoje das ${today.openTime} às ${today.closeTime}`,
    };
  }, [tenant]);

  // Clean phone for WhatsApp link
  const cleanPhone = useMemo(() => {
    if (!tenant?.phone) return '';
    return tenant.phone.replace(/\D/g, '');
  }, [tenant?.phone]);

  const whatsappUrl = useMemo(() => {
    if (!cleanPhone) return '';
    const text = encodeURIComponent(`Olá! Gostaria de informações sobre os serviços da ${tenant?.name || 'barbearia'}.`);
    return `https://wa.me/${cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`}?text=${text}`;
  }, [cleanPhone, tenant?.name]);

  
  useEffect(() => {
    if (!slug) return;
    const fetchLoyalty = async () => {
      try {
        const res = await api.get<PublicLoyaltyResponse>('/api/public/tenants/' + encodeURIComponent(slug) + '/loyalty');
        if (res && res.enabled) {
          setLoyaltyProgram(res);
        }
      } catch {
        // Silêncio se não habilitado
      }
    };
    const fetchClub = async () => {
      try {
        const res = await api.get<PublicClubResponse>('/api/public/tenants/' + encodeURIComponent(slug) + '/club');
        if (res && res.plans && res.plans.length > 0) {
          setClubPlans(res.plans);
        }
      } catch {
        // Silêncio se não houver planos
      }
    };
    fetchLoyalty();
    fetchClub();
  }, [slug]);

  const handleSearchLoyalty = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = loyaltyPhone.replace(/\D/g, '');
    if (!clean || clean.length < 8) return;
    try {
      setLoyaltyLoading(true);
      setLoyaltySearched(true);
      const res = await api.get<PublicLoyaltyResponse>(
        '/api/public/tenants/' + encodeURIComponent(slug) + '/loyalty?phone=' + encodeURIComponent(clean)
      );
      setLoyaltyResult(res);
    } catch (err: any) {
      setLoyaltyResult({
        enabled: true,
        found: false,
        message: err?.message || 'Não foi possível consultar os carimbos no momento.',
      });
    } finally {
      setLoyaltyLoading(false);
    }
  };

  const handleLoyaltyPhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 11);
    let formatted = raw;
    if (raw.length > 2) {
      formatted = '(' + raw.slice(0, 2) + ') ' + raw.slice(2);
    }
    if (raw.length > 7) {
      formatted = '(' + raw.slice(0, 2) + ') ' + raw.slice(2, 7) + '-' + raw.slice(7);
    }
    setLoyaltyPhone(formatted);
  };

  const handleClubPhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 11);
    let formatted = raw;
    if (raw.length > 2) {
      formatted = '(' + raw.slice(0, 2) + ') ' + raw.slice(2);
    }
    if (raw.length > 7) {
      formatted = '(' + raw.slice(0, 2) + ') ' + raw.slice(2, 7) + '-' + raw.slice(7);
    }
    setClubSubPhone(formatted);
  };

  const handleSearchClubSubscription = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = clubSubPhone.replace(/\D/g, '');
    if (!clean || clean.length < 8) return;
    try {
      setClubSubLoading(true);
      setClubSubSearched(true);
      setClubAutoRenewFeedback(null);
      const res = await api.get<PublicCustomerClubSubResponse>(
        '/api/public/tenants/' + encodeURIComponent(slug) + '/club/subscription?phone=' + encodeURIComponent(clean)
      );
      setClubSubResult(res);
    } catch (err: any) {
      setClubSubResult({
        found: false,
        message: err?.message || 'Não foi possível consultar sua assinatura no momento.',
      });
    } finally {
      setClubSubLoading(false);
    }
  };

  const handleTogglePublicClubAutoRenew = async (nextAutoRenew: boolean) => {
    const clean = clubSubPhone.replace(/\D/g, '');
    if (!clean || !clubSubResult?.subscription) return;
    try {
      setTogglingClubAutoRenew(true);
      setClubAutoRenewFeedback(null);
      const res = await api.post<{ success: boolean; autoRenew: boolean; message: string }>(
        '/api/public/tenants/' + encodeURIComponent(slug) + '/club/subscription/auto-renew',
        { phone: clean, autoRenew: nextAutoRenew }
      );
      setClubSubResult((prev) =>
        prev && prev.subscription
          ? {
              ...prev,
              subscription: {
                ...prev.subscription,
                autoRenew: res.autoRenew,
              },
            }
          : prev
      );
      setClubAutoRenewFeedback(res.message);
    } catch (err: any) {
      setClubAutoRenewFeedback(err?.message || 'Não foi possível atualizar sua preferência de renovação.');
    } finally {
      setTogglingClubAutoRenew(false);
    }
  };

  const instagramUrl = useMemo(() => {
    if (!tenant?.instagram) return null;
    const clean = tenant.instagram.trim().replace(/^@/, '');
    if (clean.startsWith('http')) return clean;
    return `https://instagram.com/${clean}`;
  }, [tenant?.instagram]);

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'radial-gradient(circle at top center, rgba(229, 179, 56, 0.08) 0%, transparent 60%)',
          gap: '16px',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            border: '3px solid rgba(229, 179, 56, 0.2)',
            borderTopColor: 'var(--primary)',
            animation: 'spin 1s linear infinite',
          }}
        />
        <span style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Carregando barbearia...</span>
        <style jsx>{`
          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    );
  }

  if (notFound || !tenant) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: 'radial-gradient(circle at top center, rgba(229, 179, 56, 0.08) 0%, transparent 60%)',
        }}
      >
        <div
          className="glass-panel text-center"
          style={{ maxWidth: '440px', padding: '40px', textAlign: 'center' }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              background: 'rgba(244, 63, 94, 0.12)',
              color: '#FB7185',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20px',
            }}
          >
            <AlertCircle size={28} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '8px' }}>
            Barbearia não encontrada
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '24px' }}>
            A página que você tentou acessar não existe ou foi temporariamente desativada.
          </p>
          <Link
            href="/"
            className="gold-gradient-primary gold-glow"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 24px',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            <Globe size={18} />
            <span>Ir para o BarberFlow</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#0B0F17' }}>
      {/* ────────────────── Header / Navbar ────────────────── */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(11, 15, 23, 0.88)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
          padding: '14px 24px',
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
          }}
        >
          {/* Logo & Name */}
          <Link
            href={homeHref}
            style={{ display: 'flex', alignItems: 'center', gap: '14px', textDecoration: 'none', color: 'inherit' }}
          >
            {tenant.logoUrl ? (
              <img
                src={tenant.logoUrl}
                alt={tenant.name}
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '10px',
                  objectFit: 'cover',
                  border: '1px solid rgba(229, 179, 56, 0.3)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                }}
              />
            ) : (
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #E5B338, #966C0F)',
                  color: '#0B0F17',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '1.3rem',
                }}
              >
                {tenant.name.charAt(0).toUpperCase()}
              </div>
            )}

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                  {tenant.name}
                </span>
                {todaySchedule?.isOpen ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: 'rgba(16, 185, 129, 0.15)',
                      color: '#10B981',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                    }}
                  >
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' }} />
                    Aberto
                  </span>
                ) : (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: 'rgba(244, 63, 94, 0.15)',
                      color: '#FB7185',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                    }}
                  >
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#FB7185' }} />
                    Fechado
                  </span>
                )}
              </div>
            </div>
          </Link>

          {/* Nav links & CTA */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <nav style={{ display: 'flex', alignItems: 'center', gap: '22px' }} className="hide-on-mobile">
              {[
                { id: 'servicos', label: 'Serviços', show: true },
                { id: 'equipe', label: 'Barbeiros', show: tenant.professionals.length > 0 },
                { id: 'clube', label: 'Clube VIP', show: Boolean(clubPlans && clubPlans.length > 0) },
                { id: 'fidelidade', label: 'Fidelidade', show: Boolean(loyaltyProgram?.enabled) },
                { id: 'galeria', label: 'Galeria', show: Boolean(tenant.gallery && tenant.gallery.length > 0) },
                { id: 'sobre', label: 'Horários & Local', show: true },
              ]
                .filter((item) => item.show)
                .map((item) => {
                  const isActive = activeSection === item.id;
                  return (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      onClick={(e) => handleNavClick(e, item.id)}
                      style={{
                        position: 'relative',
                        color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                        textDecoration: 'none',
                        fontSize: '0.92rem',
                        fontWeight: isActive ? 700 : 500,
                        padding: '6px 2px',
                        borderBottom: isActive ? '2px solid var(--primary)' : '2px solid transparent',
                        transition: 'color 0.2s ease, border-color 0.2s ease',
                      }}
                    >
                      {item.label}
                    </a>
                  );
                })}
            </nav>

            <Link
              href={bookingBaseHref}
              className="gold-gradient-primary gold-glow"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '0.88rem',
              }}
            >
              <Scissors size={16} />
              <span>Agendar Horário</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ────────────────── Hero Showcase Section ────────────────── */}
      <section
        style={{
          position: 'relative',
          padding: '80px 24px 70px 24px',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '480px',
          background: tenant.coverUrl
            ? `linear-gradient(180deg, rgba(11, 15, 23, 0.72) 0%, rgba(11, 15, 23, 0.95) 100%), url(${tenant.coverUrl}) center/cover no-repeat`
            : 'linear-gradient(180deg, #111827 0%, #0B0F17 100%)',
        }}
      >
        <div style={{ maxWidth: '820px', width: '100%', textAlign: 'center', position: 'relative', zIndex: 2 }}>

          <h1
            style={{
              fontSize: 'clamp(2.2rem, 5vw, 3.4rem)',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              lineHeight: 1.15,
              marginBottom: '18px',
              color: '#FFFFFF',
            }}
          >
            {tenant.name}
          </h1>

          <p
            style={{
              fontSize: 'clamp(1rem, 2vw, 1.18rem)',
              color: '#D1D5DB',
              lineHeight: 1.6,
              maxWidth: '680px',
              margin: '0 auto 32px auto',
            }}
          >
            {tenant.bio ||
              'Sua melhor versão começa aqui. Cortes impecáveis, barba alinhada e um atendimento exclusivo pensado para o seu bem-estar.'}
          </p>

          {/* Action Buttons */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '14px',
              flexWrap: 'wrap',
            }}
          >
            <Link
              href={bookingBaseHref}
              className="gold-gradient-primary gold-glow"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                padding: '14px 28px',
                borderRadius: '10px',
                fontSize: '1rem',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              <Scissors size={20} />
              <span>Agendar Horário Online</span>
              <ArrowRight size={18} />
            </Link>

            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="glass-card"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '14px 22px',
                  borderRadius: '10px',
                  fontSize: '0.96rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  color: '#34D399',
                  borderColor: 'rgba(52, 211, 153, 0.3)',
                }}
              >
                <MessageSquare size={18} />
                <span>Falar no WhatsApp</span>
              </a>
            )}

            {instagramUrl && (
              <a
                href={instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="glass-card"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '14px 20px',
                  borderRadius: '10px',
                  fontSize: '0.96rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  color: '#F472B6',
                  borderColor: 'rgba(244, 114, 182, 0.3)',
                }}
              >
                <Instagram size={18} />
                <span>Instagram</span>
              </a>
            )}
          </div>
        </div>
      </section>

      {/* ────────────────── Quick Info Strip ────────────────── */}
      <section
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(18, 24, 38, 0.6)',
          padding: '20px 24px',
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '20px',
            alignItems: 'center',
          }}
        >
          {tenant.address && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: 'rgba(229, 179, 56, 0.12)',
                  color: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <MapPin size={20} />
              </div>
              <div>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Endereço
                </span>
                <p style={{ fontSize: '0.88rem', color: '#F3F4F6', margin: 0, fontWeight: 500 }}>
                  {tenant.address}
                </p>
              </div>
            </div>
          )}

          {tenant.phone && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: 'rgba(16, 185, 129, 0.12)',
                  color: '#10B981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Phone size={20} />
              </div>
              <div>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Telefone / WhatsApp
                </span>
                <p style={{ fontSize: '0.88rem', color: '#F3F4F6', margin: 0, fontWeight: 500 }}>
                  {tenant.phone}
                </p>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: todaySchedule?.isOpen ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)',
                color: todaySchedule?.isOpen ? '#10B981' : '#FB7185',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Clock size={20} />
            </div>
            <div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Expediente
              </span>
              <p style={{ fontSize: '0.88rem', color: '#F3F4F6', margin: 0, fontWeight: 500 }}>
                {todaySchedule?.text || 'Consulte horários'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ────────────────── Catálogo de Serviços ────────────────── */}
      <section id="servicos" style={{ padding: '70px 24px', maxWidth: '1200px', width: '100%', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '44px' }}>
          <span
            style={{
              fontSize: '0.82rem',
              fontWeight: 700,
              color: 'var(--primary)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Tabela de Preços
          </span>
          <h2 style={{ fontSize: '2.1rem', fontWeight: 800, letterSpacing: '-0.02em', marginTop: '6px', marginBottom: '10px' }}>
            Nossos Serviços & Cuidados
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', maxWidth: '560px', margin: '0 auto' }}>
            Escolha o atendimento desejado e garanta seu horário com praticidade e rapidez.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '20px',
          }}
        >
          {tenant.services.map((service) => {
            const isPromo = Boolean(
              service.promoActive &&
              service.promoPriceCents &&
              service.promoPriceCents < service.priceCents &&
              (!service.promoExpiresAt || new Date(service.promoExpiresAt) > new Date())
            );
            const discountPercent = isPromo
              ? Math.round(((service.priceCents - service.promoPriceCents!) / service.priceCents) * 100)
              : 0;

            const hasRecurring = Boolean(service.promoDaysOfWeek && service.promoDaysOfWeek.length > 0);
            const recurringWeekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
            const recurringFullDays = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
            const recurringText = hasRecurring
              ? service.promoDaysOfWeek!.length === 1
                ? `Toda ${recurringFullDays[service.promoDaysOfWeek![0]]}`
                : service.promoDaysOfWeek!.map((d) => recurringWeekdays[d]).join(', ')
              : null;

            const isPromoToday = isPromo && (service.isPromoActiveToday ?? true);

            const expiresDate = service.promoExpiresAt ? new Date(service.promoExpiresAt) : null;
            const formattedExpires = expiresDate
              ? `${String(expiresDate.getDate()).padStart(2, '0')}/${String(expiresDate.getMonth() + 1).padStart(2, '0')} às ${String(expiresDate.getHours()).padStart(2, '0')}:${String(expiresDate.getMinutes()).padStart(2, '0')}`
              : null;

            return (
              <div
                key={service.id}
                className="glass-panel"
                style={{
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  transition: 'transform 0.2s, border-color 0.2s',
                  border: isPromo ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid var(--border-color)',
                  background: isPromo
                    ? 'linear-gradient(180deg, rgba(245, 158, 11, 0.07) 0%, rgba(18, 24, 38, 0.7) 100%)'
                    : undefined,
                  boxShadow: isPromo ? '0 8px 24px rgba(245, 158, 11, 0.12)' : undefined,
                }}
              >
                <div>
                  {/* Badges de Promoção na Vitrine */}
                  {isPromo && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: 'rgba(245, 158, 11, 0.2)',
                          color: '#F59E0B',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          border: '1px solid rgba(245, 158, 11, 0.35)',
                        }}
                      >
                        <Flame size={12} />
                        PROMOÇÃO
                      </span>
                      {discountPercent > 0 && (
                        <span
                          style={{
                            background: 'rgba(16, 185, 129, 0.2)',
                            color: '#34D399',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                          }}
                        >
                          -{discountPercent}% OFF
                        </span>
                      )}
                      {service.promoTitle && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            color: '#F59E0B',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                          }}
                        >
                          <Tag size={12} />
                          {service.promoTitle}
                        </span>
                      )}
                      {recurringText && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'rgba(245, 158, 11, 0.15)',
                            color: '#FCD34D',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                          }}
                        >
                          <Repeat size={11} />
                          <span>{recurringText}</span>
                          {service.isPromoActiveToday !== undefined && (
                            <span
                              style={{
                                marginLeft: '3px',
                                fontWeight: 700,
                                color: service.isPromoActiveToday ? '#34D399' : '#94A3B8',
                              }}
                            >
                              • {service.isPromoActiveToday ? 'Ativa Hoje!' : 'Normal hoje'}
                            </span>
                          )}
                        </span>
                      )}
                      {formattedExpires && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'rgba(239, 68, 68, 0.15)',
                            color: '#F87171',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                          }}
                        >
                          <Clock size={11} />
                          Válido até {formattedExpires}
                        </span>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
                    <h3 style={{ fontSize: '1.18rem', fontWeight: 700, color: '#F9FAFB', margin: 0 }}>
                      {service.name}
                    </h3>
                    <div style={{ textAlign: 'right' }}>
                      {isPromo ? (
                        !isPromoToday ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <span
                              style={{
                                fontSize: '1.25rem',
                                fontWeight: 800,
                                color: 'var(--primary)',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {formatBRL(service.priceCents)}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: '#F59E0B', fontWeight: 600 }}>
                              {formatBRL(service.promoPriceCents!)} ({recurringText})
                            </span>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <span style={{ fontSize: '0.85rem', color: '#94A3B8', textDecoration: 'line-through' }}>
                              {formatBRL(service.priceCents)}
                            </span>
                            <span
                              style={{
                                fontSize: '1.3rem',
                                fontWeight: 800,
                                color: '#10B981',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {formatBRL(service.promoPriceCents!)}
                            </span>
                          </div>
                        )
                      ) : (
                        <span
                          style={{
                            fontSize: '1.25rem',
                            fontWeight: 800,
                            color: 'var(--primary)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {formatBRL(service.priceCents)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-dim)', fontSize: '0.84rem', marginBottom: '12px' }}>
                    <Clock size={14} color="var(--primary)" />
                    <span>Duração média: {service.durationMinutes} minutos</span>
                  </div>

                  {service.description && (
                    <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '18px' }}>
                      {service.description}
                    </p>
                  )}
                </div>

                <Link
                  href={`${bookingBaseHref}?serviceId=${service.id}`}
                  className="gold-gradient-primary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    borderRadius: '8px',
                    textDecoration: 'none',
                    fontWeight: 700,
                    fontSize: '0.88rem',
                    marginTop: '12px',
                  }}
                >
                  <span>{isPromo ? 'Agendar com Desconto' : 'Agendar este Serviço'}</span>
                  <ArrowRight size={15} />
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* ────────────────── Equipe de Barbeiros ────────────────── */}
      {tenant.professionals.length > 0 && (
        <section
          id="equipe"
          style={{
            padding: '70px 24px',
            background: 'rgba(18, 24, 38, 0.4)',
            borderTop: '1px solid rgba(255, 255, 255, 0.05)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          }}
        >
          <div style={{ maxWidth: '1200px', width: '100%', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '44px' }}>
              <span
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: 'var(--primary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                Profissionais
              </span>
              <h2 style={{ fontSize: '2.1rem', fontWeight: 800, letterSpacing: '-0.02em', marginTop: '6px', marginBottom: '10px' }}>
                Nossa Equipe de Barbeiros
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', maxWidth: '560px', margin: '0 auto' }}>
                Conheça os profissionais que garantem a excelência no atendimento da nossa casa.
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '20px',
              }}
            >
              {tenant.professionals.map((prof) => (
                <div
                  key={prof.id}
                  className="glass-panel"
                  style={{
                    padding: '24px',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                >
                  {prof.avatarUrl ? (
                    <img
                      src={prof.avatarUrl}
                      alt={prof.name}
                      style={{
                        width: '74px',
                        height: '74px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        marginBottom: '16px',
                        boxShadow: `0 6px 18px ${prof.color || 'var(--primary)'}44`,
                        border: `2.5px solid ${prof.color || 'var(--primary)'}`,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '74px',
                        height: '74px',
                        borderRadius: '50%',
                        background: prof.color || 'var(--primary)',
                        color: '#0B0F17',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: '1.8rem',
                        marginBottom: '16px',
                        boxShadow: '0 6px 18px rgba(0, 0, 0, 0.5)',
                        border: '2px solid rgba(255, 255, 255, 0.1)',
                      }}
                    >
                      {prof.name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <h3 style={{ fontSize: '1.18rem', fontWeight: 700, marginBottom: '6px' }}>
                    {prof.name}
                  </h3>
                  <span style={{ fontSize: '0.84rem', color: 'var(--text-dim)', marginBottom: '18px' }}>
                    Barbeiro Especialista
                  </span>

                  <Link
                    href={`${bookingBaseHref}?professionalId=${prof.id}`}
                    className="glass-card"
                    style={{
                      width: '100%',
                      padding: '9px 14px',
                      borderRadius: '8px',
                      textDecoration: 'none',
                      fontSize: '0.86rem',
                      fontWeight: 600,
                      color: 'var(--primary)',
                      borderColor: 'rgba(229, 179, 56, 0.3)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>Agendar com {prof.name.split(' ')[0]}</span>
                    <ArrowRight size={14} />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      
      {/* ────────────────── Clube de Assinatura VIP ────────────────── */}
      {clubPlans && clubPlans.length > 0 && (
        <section
          id="clube"
          style={{
            padding: '70px 24px',
            maxWidth: '1200px',
            width: '100%',
            margin: '0 auto',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '36px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                borderRadius: '20px',
                background: 'rgba(229, 179, 56, 0.12)',
                color: 'var(--primary)',
                fontSize: '0.8rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '10px',
                border: '1px solid rgba(229, 179, 56, 0.25)',
              }}
            >
              <Crown size={15} />
              Clube de Assinatura VIP
            </span>
            <h2
              style={{
                fontSize: '2.1rem',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                marginTop: '4px',
                marginBottom: '10px',
              }}
            >
              Cortes e Barbas Ilimitados Todo Mês
            </h2>
            <p
              style={{
                color: 'var(--text-muted)',
                fontSize: '0.98rem',
                maxWidth: '640px',
                margin: '0 auto',
                lineHeight: 1.5,
              }}
            >
              Economize e mantenha o visual sempre impecável. Assine um plano mensal e tenha agendamentos garantidos com condições exclusivas!
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '24px',
              maxWidth: '1000px',
              margin: '0 auto',
            }}
          >
            {clubPlans.map((plan) => {
              const whatsappPlanUrl = cleanPhone
                ? `https://wa.me/${cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`}?text=${encodeURIComponent(
                    `Olá! Gostaria de assinar o plano ${plan.name} (${formatBRL(plan.priceCents)}/mês) do Clube VIP da ${tenant.name}. Como posso aderir?`
                  )}`
                : null;

              return (
                <div
                  key={plan.id}
                  className="glass-panel"
                  style={{
                    padding: '30px 24px',
                    borderRadius: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative',
                    border: '1px solid rgba(229, 179, 56, 0.35)',
                    background: 'linear-gradient(180deg, rgba(229, 179, 56, 0.08) 0%, rgba(11, 15, 23, 0.85) 100%)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          color: '#E5B338',
                          background: 'rgba(229, 179, 56, 0.16)',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      >
                        {plan.maxUsagesPerMonth === null ? 'Ilimitado' : `${plan.maxUsagesPerMonth} Usos / mês`}
                      </span>
                      <Crown size={20} color="#E5B338" />
                    </div>

                    <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 6px 0' }}>
                      {plan.name}
                    </h3>

                    {plan.description && (
                      <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: '0 0 16px 0', lineHeight: 1.4 }}>
                        {plan.description}
                      </p>
                    )}

                    <div style={{ margin: '18px 0', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                      <span style={{ fontSize: '2.1rem', fontWeight: 900, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
                        {formatBRL(plan.priceCents)}
                      </span>
                      <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>/ mês</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', color: 'var(--text-main)' }}>
                        <Check size={16} color="#34D399" />
                        <span>
                          {plan.maxUsagesPerMonth === null
                            ? 'Utilizações ilimitadas durante o ciclo'
                            : `Até ${plan.maxUsagesPerMonth} atendimentos no mês`}
                        </span>
                      </div>

                      {plan.services && plan.services.length > 0 && (
                        <div style={{ marginTop: '4px' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>
                            Serviços inclusos:
                          </span>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                            {plan.services.map((s, idx) => (
                              <span
                                key={idx}
                                style={{
                                  fontSize: '0.74rem',
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  background: 'rgba(255, 255, 255, 0.06)',
                                  color: 'var(--text-main)',
                                  border: '1px solid rgba(255, 255, 255, 0.1)',
                                }}
                              >
                                {s.service?.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    {whatsappPlanUrl ? (
                      <a
                        href={whatsappPlanUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-primary"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          padding: '11px 16px',
                          fontSize: '0.88rem',
                          fontWeight: 700,
                          textDecoration: 'none',
                        }}
                      >
                        <MessageSquare size={16} />
                        Assinar via WhatsApp
                      </a>
                    ) : (
                      <Link
                        href={bookingBaseHref}
                        className="btn-primary"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          padding: '11px 16px',
                          fontSize: '0.88rem',
                          fontWeight: 700,
                          textDecoration: 'none',
                        }}
                      >
                        <CalendarIcon size={16} />
                        Agendar Atendimento
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Autoatendimento do Assinante VIP: Consulta de Plano & Toggle Auto-Renew ── */}
          <div
            className="glass-panel"
            style={{
              maxWidth: '720px',
              margin: '36px auto 0 auto',
              padding: '24px 28px',
              borderRadius: '16px',
              border: '1px solid rgba(229, 179, 56, 0.3)',
              background: 'linear-gradient(180deg, rgba(18, 24, 38, 0.9) 0%, rgba(11, 15, 23, 0.95) 100%)',
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.35)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <Crown size={20} color="#E5B338" />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
                Já é Assinante VIP? Gerencie sua Renovação Automática (Auto-Renew)
              </h3>
            </div>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', margin: '0 0 16px 0', lineHeight: 1.5 }}>
              Digite seu WhatsApp abaixo para consultar seus usos no mês e escolher se prefere renovar seu plano{' '}
              <strong>automaticamente</strong> ou <strong>manualmente</strong>.
            </p>

            <form onSubmit={handleSearchClubSubscription} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
                <Phone
                  size={17}
                  style={{
                    position: 'absolute',
                    left: '14px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-dim)',
                  }}
                />
                <input
                  type="tel"
                  value={clubSubPhone}
                  onChange={handleClubPhoneChange}
                  placeholder="(00) 00000-0000"
                  style={{
                    width: '100%',
                    padding: '11px 14px 11px 40px',
                    background: 'rgba(15, 23, 42, 0.85)',
                    border: '1px solid rgba(255, 255, 255, 0.14)',
                    borderRadius: '10px',
                    color: '#FFF',
                    fontSize: '0.92rem',
                    outline: 'none',
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={clubSubLoading || clubSubPhone.replace(/\D/g, '').length < 8}
                className="gold-gradient-primary"
                style={{
                  padding: '11px 20px',
                  borderRadius: '10px',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: clubSubLoading ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  opacity: clubSubLoading || clubSubPhone.replace(/\D/g, '').length < 8 ? 0.6 : 1,
                }}
              >
                {clubSubLoading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Consultando...</span>
                  </>
                ) : (
                  <>
                    <Search size={16} />
                    <span>Minha Assinatura</span>
                  </>
                )}
              </button>
            </form>

            {clubSubSearched && clubSubResult && (
              <div style={{ marginTop: '18px' }}>
                {clubSubResult.found && clubSubResult.subscription ? (
                  <div
                    style={{
                      padding: '18px',
                      borderRadius: '12px',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(229, 179, 56, 0.25)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '14px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>
                          Assinante VIP
                        </span>
                        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#FFFFFF' }}>
                          {clubSubResult.subscription.customerName} —{' '}
                          <span style={{ color: '#E5B338' }}>{clubSubResult.subscription.planName}</span>
                        </div>
                      </div>
                      <span
                        style={{
                          padding: '4px 10px',
                          borderRadius: '999px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background:
                            clubSubResult.subscription.status === 'ACTIVE'
                              ? 'rgba(16, 185, 129, 0.15)'
                              : 'rgba(239, 68, 68, 0.15)',
                          color: clubSubResult.subscription.status === 'ACTIVE' ? '#34D399' : '#F87171',
                        }}
                      >
                        {clubSubResult.subscription.status === 'ACTIVE' ? 'Assinatura Ativa' : 'Ciclo Vencido / Pendente'}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                      <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.6)' }}>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>Vencimento do Ciclo</div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#F8FAFC', marginTop: '2px' }}>
                          {new Date(clubSubResult.subscription.cycleEndDate).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                      <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.6)' }}>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>Cortes / Usos no Ciclo</div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#E5B338', marginTop: '2px' }}>
                          {clubSubResult.subscription.usagesCount}{' '}
                          {clubSubResult.subscription.maxUsagesPerMonth === null
                            ? '(Ilimitado)'
                            : `de ${clubSubResult.subscription.maxUsagesPerMonth}`}
                        </div>
                      </div>
                    </div>

                    {/* Seletor de Auto-Renew pelo próprio cliente */}
                    <div
                      style={{
                        padding: '14px',
                        borderRadius: '10px',
                        background: 'rgba(15, 23, 42, 0.85)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                      }}
                    >
                      <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#F8FAFC', marginBottom: '8px' }}>
                        Como você prefere renovar seu plano no vencimento?
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px' }}>
                        <button
                          type="button"
                          disabled={togglingClubAutoRenew}
                          onClick={() => handleTogglePublicClubAutoRenew(true)}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '8px',
                            textAlign: 'left',
                            cursor: togglingClubAutoRenew ? 'wait' : 'pointer',
                            border: clubSubResult.subscription.autoRenew
                              ? '1.5px solid #10B981'
                              : '1px solid rgba(255, 255, 255, 0.12)',
                            background: clubSubResult.subscription.autoRenew
                              ? 'rgba(16, 185, 129, 0.14)'
                              : 'rgba(255, 255, 255, 0.03)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 700, color: clubSubResult.subscription.autoRenew ? '#34D399' : '#E2E8F0' }}>
                            <RefreshCw size={14} /> Renovação Automática (ON)
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                            Renova automaticamente o ciclo e o Bot confirma no seu WhatsApp.
                          </div>
                        </button>

                        <button
                          type="button"
                          disabled={togglingClubAutoRenew}
                          onClick={() => handleTogglePublicClubAutoRenew(false)}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '8px',
                            textAlign: 'left',
                            cursor: togglingClubAutoRenew ? 'wait' : 'pointer',
                            border: !clubSubResult.subscription.autoRenew
                              ? '1.5px solid #F59E0B'
                              : '1px solid rgba(255, 255, 255, 0.12)',
                            background: !clubSubResult.subscription.autoRenew
                              ? 'rgba(245, 158, 11, 0.14)'
                              : 'rgba(255, 255, 255, 0.03)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 700, color: !clubSubResult.subscription.autoRenew ? '#FBBF24' : '#E2E8F0' }}>
                            <CalendarIcon size={14} /> Renovação Manual (OFF)
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                            Você recebe os avisos no WhatsApp e decide manualmente quando renovar.
                          </div>
                        </button>
                      </div>

                      {clubAutoRenewFeedback && (
                        <div
                          style={{
                            marginTop: '10px',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            background: 'rgba(16, 185, 129, 0.12)',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            color: '#34D399',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                          }}
                        >
                          {clubAutoRenewFeedback}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      padding: '14px 16px',
                      borderRadius: '10px',
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      color: '#FCA5A5',
                      fontSize: '0.85rem',
                    }}
                  >
                    {clubSubResult.message || 'Nenhuma assinatura encontrada para este WhatsApp.'}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ────────────────── Cartão Fidelidade Digital ────────────────── */}
      {loyaltyProgram?.enabled && (
        <section
          id="fidelidade"
          style={{
            padding: '70px 24px',
            maxWidth: '1200px',
            width: '100%',
            margin: '0 auto',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '36px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                borderRadius: '20px',
                background: 'rgba(229, 179, 56, 0.12)',
                color: 'var(--primary)',
                fontSize: '0.8rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '10px',
                border: '1px solid rgba(229, 179, 56, 0.25)',
              }}
            >
              <Award size={15} />
              Programa de Fidelidade
            </span>
            <h2
              style={{
                fontSize: '2.1rem',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                marginTop: '4px',
                marginBottom: '10px',
              }}
            >
              Seu Cartão Fidelidade Digital
            </h2>
            <p
              style={{
                color: 'var(--text-muted)',
                fontSize: '0.98rem',
                maxWidth: '620px',
                margin: '0 auto',
                lineHeight: 1.5,
              }}
            >
              A cada corte ou serviço concluído na barbearia, você ganha <strong>+1 carimbo</strong> no WhatsApp. Ao
              completar <strong>{loyaltyProgram.targetStamps || 10} carimbos</strong>, você ganha{' '}
              <strong style={{ color: 'var(--primary)' }}>
                {loyaltyProgram.rewardText || '1 Corte Grátis'}
              </strong>
              !
            </p>
          </div>

          <div
            style={{
              maxWidth: '680px',
              margin: '0 auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
            }}
          >
            {/* Caixa de Busca por Telefone */}
            <form
              onSubmit={handleSearchLoyalty}
              className="glass-panel"
              style={{
                padding: '20px 24px',
                borderRadius: '16px',
                border: '1px solid rgba(229, 179, 56, 0.25)',
                boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4)',
              }}
            >
              <label
                style={{
                  display: 'block',
                  fontSize: '0.86rem',
                  fontWeight: 600,
                  color: '#E2E8F0',
                  marginBottom: '10px',
                }}
              >
                Consulte seus carimbos acumulados:
              </label>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
                  <Phone
                    size={17}
                    style={{
                      position: 'absolute',
                      left: '14px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-dim)',
                    }}
                  />
                  <input
                    type="tel"
                    value={loyaltyPhone}
                    onChange={handleLoyaltyPhoneChange}
                    placeholder="(00) 00000-0000"
                    style={{
                      width: '100%',
                      padding: '11px 14px 11px 40px',
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '10px',
                      color: '#FFF',
                      fontSize: '0.92rem',
                      outline: 'none',
                    }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loyaltyLoading || loyaltyPhone.replace(/\D/g, '').length < 8}
                  className="gold-gradient-primary gold-glow"
                  style={{
                    padding: '11px 22px',
                    borderRadius: '10px',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    cursor: loyaltyLoading ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    opacity: loyaltyLoading || loyaltyPhone.replace(/\D/g, '').length < 8 ? 0.6 : 1,
                  }}
                >
                  {loyaltyLoading ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>Buscando...</span>
                    </>
                  ) : (
                    <>
                      <Search size={16} />
                      <span>Consultar</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Resultado do Cartão */}
            {loyaltySearched && loyaltyResult ? (
              loyaltyResult.found ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Banner de Prêmio Disponível se houver */}
                  {(loyaltyResult.rewardsAvailable ?? 0) > 0 && (
                    <div
                      style={{
                        padding: '16px 20px',
                        borderRadius: '14px',
                        background:
                          'linear-gradient(135deg, rgba(229, 179, 56, 0.22) 0%, rgba(217, 119, 6, 0.15) 100%)',
                        border: '1.5px solid rgba(229, 179, 56, 0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        boxShadow: '0 8px 24px rgba(229, 179, 56, 0.15)',
                      }}
                    >
                      <div
                        style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '12px',
                          background: 'linear-gradient(135deg, #E5B338, #966C0F)',
                          color: '#0B0F17',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Gift size={22} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#FDE68A' }}>
                          🎉 Parabéns, {loyaltyResult.customerName}!
                        </h4>
                        <p style={{ margin: '3px 0 0', fontSize: '0.86rem', color: '#E2E8F0', lineHeight: 1.4 }}>
                          Você possui <strong>{loyaltyResult.rewardsAvailable} recompensa(s) liberada(s)</strong>:{' '}
                          <span style={{ color: 'var(--primary)', fontWeight: 700 }}>
                            {loyaltyResult.rewardText || loyaltyProgram.rewardText}
                          </span>
                          . Informe seu telefone ao barbeiro para resgatar!
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Cartão Digital Interativo */}
                  <div
                    style={{
                      position: 'relative',
                      overflow: 'hidden',
                      padding: '28px 26px',
                      borderRadius: '20px',
                      background:
                        'radial-gradient(ellipse at top left, rgba(229, 179, 56, 0.16) 0%, rgba(15, 23, 42, 0.95) 55%, #0B0F17 100%)',
                      border: '1.5px solid rgba(229, 179, 56, 0.35)',
                      boxShadow: '0 16px 40px rgba(0, 0, 0, 0.6), 0 0 35px rgba(229, 179, 56, 0.08)',
                    }}
                  >
                    {/* Cabeçalho do Cartão */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                        paddingBottom: '16px',
                        marginBottom: '22px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {tenant.logoUrl ? (
                          <img
                            src={tenant.logoUrl}
                            alt={tenant.name}
                            style={{
                              width: '38px',
                              height: '38px',
                              borderRadius: '10px',
                              objectFit: 'cover',
                              border: '1px solid rgba(229, 179, 56, 0.4)',
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '38px',
                              height: '38px',
                              borderRadius: '10px',
                              background: 'linear-gradient(135deg, #E5B338, #966C0F)',
                              color: '#0B0F17',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 800,
                              fontSize: '1.1rem',
                            }}
                          >
                            {tenant.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#FFF' }}>
                            {tenant.name}
                          </h4>
                          <span style={{ fontSize: '0.74rem', color: 'var(--primary)', fontWeight: 600 }}>
                            Cliente VIP • {loyaltyResult.customerName}
                          </span>
                        </div>
                      </div>

                      <div
                        style={{
                          padding: '4px 10px',
                          borderRadius: '12px',
                          background: 'rgba(229, 179, 56, 0.15)',
                          border: '1px solid rgba(229, 179, 56, 0.3)',
                          color: 'var(--primary)',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                        }}
                      >
                        <Award size={13} />
                        <span>
                          {loyaltyResult.currentStamps ?? 0} / {loyaltyProgram.targetStamps ?? 10} Selos
                        </span>
                      </div>
                    </div>

                    {/* Grade de Selos Visuais */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(' + Math.min(loyaltyProgram.targetStamps || 10, 5) + ', 1fr)',
                        gap: '12px',
                        marginBottom: '22px',
                      }}
                    >
                      {Array.from({ length: loyaltyProgram.targetStamps || 10 }).map((_, idx) => {
                        const isStamped = idx < (loyaltyResult.currentStamps ?? 0);
                        const isLastSlot = idx === (loyaltyProgram.targetStamps || 10) - 1;

                        return (
                          <div
                            key={idx}
                            style={{
                              aspectRatio: '1/1',
                              borderRadius: '14px',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.25s ease',
                              background: isStamped
                                ? 'linear-gradient(135deg, #FDE68A 0%, #D97706 100%)'
                                : isLastSlot
                                ? 'rgba(229, 179, 56, 0.08)'
                                : 'rgba(255, 255, 255, 0.03)',
                              border: isStamped
                                ? '2px solid #FCD34D'
                                : isLastSlot
                                ? '2px dashed rgba(229, 179, 56, 0.4)'
                                : '2px dashed rgba(255, 255, 255, 0.12)',
                              boxShadow: isStamped
                                ? '0 4px 14px rgba(229, 179, 56, 0.35)'
                                : 'none',
                              color: isStamped ? '#0B0F17' : isLastSlot ? 'var(--primary)' : 'var(--text-dim)',
                            }}
                          >
                            {isStamped ? (
                              <Scissors size={20} style={{ strokeWidth: 2.4 }} />
                            ) : isLastSlot ? (
                              <Gift size={20} />
                            ) : (
                              <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{idx + 1}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Barra de Progresso */}
                    {(() => {
                      const cur = loyaltyResult.currentStamps ?? 0;
                      const tgt = loyaltyProgram.targetStamps ?? 10;
                      const percent = Math.min(100, Math.round((cur / tgt) * 100));
                      const remaining = Math.max(0, tgt - cur);

                      return (
                        <div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '0.82rem',
                              color: '#CBD5E1',
                              marginBottom: '6px',
                            }}
                          >
                            <span>Progresso do ciclo</span>
                            <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{percent}%</span>
                          </div>
                          <div
                            style={{
                              width: '100%',
                              height: '8px',
                              background: 'rgba(255, 255, 255, 0.08)',
                              borderRadius: '999px',
                              overflow: 'hidden',
                              marginBottom: '14px',
                            }}
                          >
                            <div
                              style={{
                                width: percent + '%',
                                height: '100%',
                                background: 'linear-gradient(90deg, #E5B338, #FDE68A)',
                                borderRadius: '999px',
                                transition: 'width 0.4s ease',
                              }}
                            />
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '0.82rem',
                              flexWrap: 'wrap',
                              gap: '8px',
                            }}
                          >
                            <span style={{ color: 'var(--text-muted)' }}>
                              {remaining > 0 ? (
                                <>
                                  Faltam apenas <strong>{remaining} selo(s)</strong> para ganhar{' '}
                                  <strong style={{ color: 'var(--primary)' }}>
                                    {loyaltyResult.rewardText || loyaltyProgram.rewardText}
                                  </strong>
                                </>
                              ) : (
                                <strong style={{ color: '#34D399' }}>Ciclo atual completo! 🎉</strong>
                              )}
                            </span>

                            {(loyaltyResult.completedCycles ?? 0) > 0 && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  color: 'var(--primary)',
                                  fontWeight: 600,
                                }}
                              >
                                <Trophy size={13} />
                                {loyaltyResult.completedCycles} ciclo(s) conquistados
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <div
                  className="glass-panel"
                  style={{
                    padding: '28px 24px',
                    textAlign: 'center',
                    borderRadius: '16px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  <div
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '12px',
                      background: 'rgba(229, 179, 56, 0.12)',
                      color: 'var(--primary)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: '12px',
                    }}
                  >
                    <Scissors size={22} />
                  </div>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', fontWeight: 700, color: '#FFF' }}>
                    Nenhum carimbo encontrado ainda
                  </h4>
                  <p
                    style={{
                      color: 'var(--text-muted)',
                      fontSize: '0.88rem',
                      maxWidth: '440px',
                      margin: '0 auto 18px',
                      lineHeight: 1.4,
                    }}
                  >
                    {loyaltyResult.message ||
                      'Não encontramos cortes concluídos para este número. Faça seu primeiro agendamento online para começar a pontuar automaticamente!'}
                  </p>
                  <Link
                    href={bookingBaseHref}
                    className="gold-gradient-primary gold-glow"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 20px',
                      borderRadius: '8px',
                      textDecoration: 'none',
                      fontWeight: 700,
                      fontSize: '0.88rem',
                    }}
                  >
                    <Scissors size={15} />
                    <span>Agendar Meu Primeiro Corte</span>
                  </Link>
                </div>
              )
            ) : (
              /* Preview Didático quando ainda não pesquisou */
              <div
                style={{
                  position: 'relative',
                  overflow: 'hidden',
                  padding: '24px 22px',
                  borderRadius: '18px',
                  background: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid rgba(229, 179, 56, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '18px',
                }}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '14px',
                    background: 'linear-gradient(135deg, rgba(229, 179, 56, 0.2), rgba(217, 119, 6, 0.1))',
                    border: '1px solid rgba(229, 179, 56, 0.3)',
                    color: 'var(--primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Gift size={24} />
                </div>
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: '0 0 4px', fontSize: '0.94rem', fontWeight: 700, color: '#F8FAFC' }}>
                    100% Automático via WhatsApp
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    Você não precisa baixar nenhum app! Ao finalizar seu corte na cadeira, o barbeiro conclui o
                    atendimento e você recebe o comprovante do selo direto no seu celular.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ────────────────── Galeria de Fotos ────────────────── */}
      {tenant.gallery && tenant.gallery.length > 0 && (
        <section id="galeria" style={{ padding: '70px 24px', maxWidth: '1200px', width: '100%', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '44px' }}>
            <span
              style={{
                fontSize: '0.82rem',
                fontWeight: 700,
                color: 'var(--primary)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Trabalhos & Espaço
            </span>
            <h2 style={{ fontSize: '2.1rem', fontWeight: 800, letterSpacing: '-0.02em', marginTop: '6px', marginBottom: '10px' }}>
              Galeria de Fotos
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', maxWidth: '560px', margin: '0 auto' }}>
              Confira os cortes, acabamentos e o ambiente da nossa barbearia.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '16px',
            }}
          >
            {tenant.gallery.map((img) => (
              <div
                key={img.id}
                onClick={() => setActivePhoto(img.url)}
                className="glass-card"
                style={{
                  position: 'relative',
                  aspectRatio: '4/3',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <img
                  src={img.url}
                  alt={img.title || 'Foto da barbearia'}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transition: 'transform 0.3s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                />
                {img.title && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      padding: '8px 12px',
                      background: 'linear-gradient(to top, rgba(0, 0, 0, 0.85), transparent)',
                      color: '#FFF',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                    }}
                  >
                    {img.title}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ────────────────── Sobre, Horários & Localização ────────────────── */}
      <section
        id="sobre"
        style={{
          padding: '70px 24px',
          background: 'rgba(18, 24, 38, 0.4)',
          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        }}
      >
        <div style={{ maxWidth: '1200px', width: '100%', margin: '0 auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '32px',
            }}
          >
            {/* Horários da Semana */}
            <div className="glass-panel" style={{ padding: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                <Clock size={22} color="var(--primary)" />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
                  Horários de Atendimento
                </h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {WEEKDAY_NAMES.map((name, index) => {
                  const day = tenant.businessHours.find((h) => h.weekday === index);
                  const isCurrentDay = new Date().getDay() === index;

                  return (
                    <div
                      key={index}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        background: isCurrentDay ? 'rgba(229, 179, 56, 0.1)' : 'transparent',
                        border: isCurrentDay ? '1px solid rgba(229, 179, 56, 0.25)' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: isCurrentDay ? 700 : 500, color: isCurrentDay ? 'var(--primary)' : '#E5E7EB' }}>
                          {name}
                        </span>
                        {isCurrentDay && (
                          <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '10px', background: 'var(--primary)', color: '#0B0F17', fontWeight: 800 }}>
                            Hoje
                          </span>
                        )}
                      </div>

                      <span style={{ fontSize: '0.88rem', color: day?.isOpen ? '#D1D5DB' : 'var(--text-dim)', fontWeight: 500 }}>
                        {day?.isOpen ? `${day.openTime} às ${day.closeTime}` : 'Fechado'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Localização & Contatos */}
            <div className="glass-panel" style={{ padding: '28px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                  <MapPin size={22} color="var(--primary)" />
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
                    Localização & Contato
                  </h3>
                </div>

                {tenant.address && (
                  <div style={{ marginBottom: '20px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Endereço da Barbearia
                    </span>
                    <p style={{ fontSize: '0.95rem', color: '#F3F4F6', margin: '4px 0 12px 0', lineHeight: 1.5, fontWeight: 500 }}>
                      {tenant.address}
                    </p>

                    {/* Google Maps Interativo Embutido */}
                    <div
                      style={{
                        width: '100%',
                        height: '210px',
                        borderRadius: '10px',
                        overflow: 'hidden',
                        marginBottom: '12px',
                        border: '1px solid rgba(229, 179, 56, 0.25)',
                        boxShadow: '0 4px 18px rgba(0, 0, 0, 0.4)',
                        background: '#0B0F17',
                      }}
                    >
                      <iframe
                        title="Localização da Barbearia no Google Maps"
                        width="100%"
                        height="100%"
                        style={{ border: 0 }}
                        loading="lazy"
                        allowFullScreen
                        referrerPolicy="no-referrer-when-downgrade"
                        src={`https://maps.google.com/maps?q=${encodeURIComponent(tenant.address)}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                      />
                    </div>

                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(tenant.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="glass-card"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '0.82rem',
                        color: 'var(--primary)',
                        textDecoration: 'none',
                        fontWeight: 600,
                      }}
                    >
                      <ExternalLink size={14} />
                      <span>Abrir no Google Maps</span>
                    </a>
                  </div>
                )}

                {tenant.phone && (
                  <div style={{ marginBottom: '20px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Telefone
                    </span>
                    <p style={{ fontSize: '0.95rem', color: '#F3F4F6', margin: '4px 0 0 0', fontWeight: 600 }}>
                      {tenant.phone}
                    </p>
                  </div>
                )}
              </div>

              <div style={{ marginTop: '24px' }}>
                <Link
                  href={bookingBaseHref}
                  className="gold-gradient-primary gold-glow"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    padding: '14px',
                    borderRadius: '10px',
                    textDecoration: 'none',
                    fontWeight: 700,
                    fontSize: '1rem',
                  }}
                >
                  <Scissors size={18} />
                  <span>Agendar Horário Agora</span>
                  <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ────────────────── Footer ────────────────── */}
      <footer
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          background: '#070A0F',
          padding: '36px 24px',
          textAlign: 'center',
          color: 'var(--text-dim)',
          fontSize: '0.84rem',
        }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#F3F4F6', fontWeight: 700, fontSize: '1rem' }}>
            <span>{tenant.name}</span>
          </div>

          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Link href={bookingBaseHref} style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>
              Agendamento Online
            </Link>
            {whatsappUrl && (
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                WhatsApp
              </a>
            )}
            {instagramUrl && (
              <a href={instagramUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                Instagram
              </a>
            )}
          </div>

          <p style={{ margin: 0, marginTop: '8px', fontSize: '0.78rem' }}>
            Desenvolvido com tecnologia{' '}
            <Link href="/" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>
              BarberFlow SaaS
            </Link>
          </p>
        </div>
      </footer>

      {/* ────────────────── Floating Mobile Bar ────────────────── */}
      <div
        className="floating-mobile-bar"
        style={{
          position: 'fixed',
          bottom: '16px',
          left: '16px',
          right: '16px',
          zIndex: 40,
        }}
      >
        <Link
          href={bookingBaseHref}
          className="gold-gradient-primary gold-glow"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            padding: '14px 24px',
            borderRadius: '12px',
            textDecoration: 'none',
            fontWeight: 800,
            fontSize: '1rem',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.7)',
          }}
        >
          <Scissors size={20} />
          <span>Agendar Horário Online</span>
        </Link>
      </div>

      {/* ────────────────── Lightbox Modal ────────────────── */}
      {activePhoto && (
        <div
          onClick={() => setActivePhoto(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.92)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <button
            onClick={() => setActivePhoto(null)}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '50%',
              width: '44px',
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFF',
              cursor: 'pointer',
            }}
          >
            <X size={24} />
          </button>
          <img
            src={activePhoto}
            alt="Foto ampliada"
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              borderRadius: '8px',
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.8)',
            }}
          />
        </div>
      )}

      {/* CSS Utilities for Mobile */}
      <style jsx>{`
        @media (min-width: 768px) {
          .floating-mobile-bar {
            display: none !important;
          }
        }
        @media (max-width: 767px) {
          .hide-on-mobile {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
