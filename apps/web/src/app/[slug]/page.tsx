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
} from 'lucide-react';
import { api } from '../../lib/api';

interface Service {
  id: string;
  name: string;
  description?: string | null;
  durationMinutes: number;
  priceCents: number;
}

interface Professional {
  id: string;
  name: string;
  color: string;
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
  const slug = (params?.slug as string) || '';
  const router = useRouter();

  const [tenant, setTenant] = useState<TenantPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Lightbox for gallery
  const [activePhoto, setActivePhoto] = useState<string | null>(null);

  useEffect(() => {
    if (!slug || RESERVED_SLUGS.includes(slug.toLowerCase())) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const fetchTenant = async () => {
      try {
        setLoading(true);
        const res = await api.get<{ tenant: TenantPublic }>(`/api/public/tenants/by-slug/${slug}`);
        setTenant(res.tenant);
      } catch (err) {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    fetchTenant();
  }, [slug]);

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
            href={`/${slug}`}
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
            <nav style={{ display: 'flex', alignItems: 'center', gap: '18px' }} className="hide-on-mobile">
              <a href="#servicos" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500 }}>
                Serviços
              </a>
              {tenant.professionals.length > 0 && (
                <a href="#equipe" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500 }}>
                  Barbeiros
                </a>
              )}
              {tenant.gallery && tenant.gallery.length > 0 && (
                <a href="#galeria" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500 }}>
                  Galeria
                </a>
              )}
              <a href="#sobre" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500 }}>
                Horários & Local
              </a>
            </nav>

            <Link
              href={`/${slug}/agendar`}
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
            : 'radial-gradient(ellipse at top center, rgba(229, 179, 56, 0.12) 0%, #0B0F17 70%)',
        }}
      >
        {/* Glow Decorator */}
        <div
          style={{
            position: 'absolute',
            top: '-40px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '600px',
            height: '240px',
            background: 'radial-gradient(circle, rgba(229, 179, 56, 0.18) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        <div style={{ maxWidth: '820px', width: '100%', textAlign: 'center', position: 'relative', zIndex: 2 }}>
          {/* Badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: '24px',
              background: 'rgba(229, 179, 56, 0.12)',
              border: '1px solid rgba(229, 179, 56, 0.3)',
              color: 'var(--primary)',
              fontSize: '0.84rem',
              fontWeight: 600,
              marginBottom: '20px',
            }}
          >
            <Sparkles size={15} />
            <span>Barbearia & Estilo Masculino</span>
          </div>

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
              href={`/${slug}/agendar`}
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
          {tenant.services.map((service) => (
            <div
              key={service.id}
              className="glass-panel"
              style={{
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'transform 0.2s, border-color 0.2s',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
                  <h3 style={{ fontSize: '1.18rem', fontWeight: 700, color: '#F9FAFB', margin: 0 }}>
                    {service.name}
                  </h3>
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
                href={`/${slug}/agendar?serviceId=${service.id}`}
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
                <span>Agendar este Serviço</span>
                <ArrowRight size={15} />
              </Link>
            </div>
          ))}
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

                  <h3 style={{ fontSize: '1.18rem', fontWeight: 700, marginBottom: '6px' }}>
                    {prof.name}
                  </h3>
                  <span style={{ fontSize: '0.84rem', color: 'var(--text-dim)', marginBottom: '18px' }}>
                    Barbeiro Especialista
                  </span>

                  <Link
                    href={`/${slug}/agendar?professionalId=${prof.id}`}
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
                        src={`https://maps.google.com/maps?q=${encodeURIComponent(`${tenant.name} ${tenant.address}`)}&t=&z=16&ie=UTF8&iwloc=&output=embed`}
                      />
                    </div>

                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(`${tenant.name} ${tenant.address}`)}`}
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
                  href={`/${slug}/agendar`}
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
            <Link href={`/${slug}/agendar`} style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>
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
          href={`/${slug}/agendar`}
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
