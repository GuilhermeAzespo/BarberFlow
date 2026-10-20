'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
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
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Globe,
  Share2,
  CalendarDays,
} from 'lucide-react';
import { api, ApiError } from '../../../lib/api';

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

interface TenantPublic {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  phone?: string | null;
  address?: string | null;
  timezone: string;
  slotIntervalMinutes: number;
  businessHours: BusinessHour[];
  services: Service[];
  professionals: Professional[];
}

interface Slot {
  startAt: string;
  time: string;
  professionalIds: string[];
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

const WEEKDAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH_NAMES = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function PublicBookingContent() {
  const params = useParams();
  const slug = (params?.slug as string) || '';
  const router = useRouter();
  const searchParams = useSearchParams();
  const preSelectedServiceId = searchParams.get('serviceId');
  const preSelectedProfessionalId = searchParams.get('professionalId');

  const [tenant, setTenant] = useState<TenantPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Booking selections
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedProfessional, setSelectedProfessional] = useState<Professional | null>(null); // null = qualquer
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('');

  // Available slots for chosen date
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<Slot[]>([]);
  const [isDayClosed, setIsDayClosed] = useState(false);

  // Customer form
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [notes, setNotes] = useState('');

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [confirmedData, setConfirmedData] = useState<any>(null);

  // 1. Fetch Tenant Public Data
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
        if (preSelectedServiceId) {
          const s = res.tenant.services.find((item) => item.id === preSelectedServiceId);
          if (s) {
            setSelectedService(s);
            setStep(2);
          }
        }
        if (preSelectedProfessionalId) {
          const p = res.tenant.professionals.find((item) => item.id === preSelectedProfessionalId);
          if (p) {
            setSelectedProfessional(p);
          }
        }
      } catch (err) {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    fetchTenant();
  }, [slug]);

  // Filter professionals that perform the selected service
  const eligibleProfessionals = useMemo(() => {
    if (!tenant || !selectedService) return [];
    return tenant.professionals.filter(
      (p) => p.services.length === 0 || p.services.some((s) => s.serviceId === selectedService.id)
    );
  }, [tenant, selectedService]);

  // Generate next 14 calendar days
  const calendarDays = useMemo(() => {
    const list: { dateStr: string; dayNum: number; weekDayName: string; monthName: string }[] = [];
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      list.push({
        dateStr,
        dayNum: d.getDate(),
        weekDayName: i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : WEEKDAY_NAMES[d.getDay()],
        monthName: MONTH_NAMES[d.getMonth()],
      });
    }
    return list;
  }, []);

  // Set default date when reaching Step 3
  useEffect(() => {
    if (step === 3 && !selectedDate && calendarDays.length > 0) {
      setSelectedDate(calendarDays[0].dateStr);
    }
  }, [step, selectedDate, calendarDays]);

  // Fetch slots whenever date, service or professional changes
  useEffect(() => {
    if (!tenant || !selectedService || !selectedDate || step !== 3) return;

    const fetchSlots = async () => {
      try {
        setSlotsLoading(true);
        setSelectedTime('');
        let url = `/api/public/tenants/by-slug/${tenant.slug}/availability?serviceId=${selectedService.id}&date=${selectedDate}`;
        if (selectedProfessional) {
          url += `&professionalId=${selectedProfessional.id}`;
        }
        const res = await api.get<{ date: string; slots: Slot[]; closed: boolean }>(url);
        setAvailableSlots(res.slots || []);
        setIsDayClosed(Boolean(res.closed));
      } catch (err) {
        setAvailableSlots([]);
      } finally {
        setSlotsLoading(false);
      }
    };

    fetchSlots();
  }, [tenant, selectedService, selectedDate, selectedProfessional, step]);

  // Handle Booking Submission
  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !selectedService || !selectedDate || !selectedTime) return;

    setBookingError(null);
    setSubmitting(true);

    try {
      const res = await api.post<{ appointment: any; message: string }>(
        `/api/public/tenants/by-slug/${tenant.slug}/appointments`,
        {
          serviceId: selectedService.id,
          professionalId: selectedProfessional?.id || null,
          date: selectedDate,
          time: selectedTime,
          customerName,
          customerPhone,
          customerEmail: customerEmail.trim() || null,
          notes: notes.trim() || null,
        }
      );

      setConfirmedData(res.appointment);
      setStep(5);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setBookingError(err.message);
      } else {
        setBookingError('Não foi possível confirmar o agendamento. Tente outro horário.');
      }
    } finally {
      setSubmitting(false);
    }
  };

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
            O link de agendamento que você acessou não existe ou foi temporariamente desativado.
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
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px 16px 60px 16px',
        background: 'radial-gradient(circle at top center, rgba(229, 179, 56, 0.08) 0%, transparent 70%)',
      }}
    >
      {/* Container Principal */}
      <div style={{ width: '100%', maxWidth: '640px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Atalho para Voltar à Home */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '-8px' }}>
          <Link
            href={`/${slug}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--primary)',
              textDecoration: 'none',
              fontSize: '0.86rem',
              fontWeight: 600,
            }}
          >
            <ArrowLeft size={16} />
            <span>Voltar para a página da barbearia</span>
          </Link>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
            Passo {step} de 4
          </span>
        </div>

        {/* Card do Salão (Header da Barbearia) */}
        <div
          className="glass-panel animate-fade-in"
          style={{
            padding: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.4)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {tenant.logoUrl ? (
              <img
                src={tenant.logoUrl}
                alt={tenant.name}
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '12px',
                  objectFit: 'cover',
                  border: '1px solid rgba(229, 179, 56, 0.3)',
                  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.5)',
                }}
              />
            ) : (
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #E5B338, #966C0F)',
                  color: '#0B0F17',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '1.6rem',
                  boxShadow: '0 4px 14px var(--primary-glow)',
                }}
              >
                {tenant.name.charAt(0).toUpperCase()}
              </div>
            )}

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h1 style={{ fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
                  {tenant.name}
                </h1>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#10B981',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                  }}
                >
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' }} />
                  Aberto
                </span>
              </div>

              {tenant.address && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.84rem', marginTop: '4px' }}>
                  <MapPin size={14} color="var(--primary)" />
                  <span>{tenant.address}</span>
                </div>
              )}

              {tenant.phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '3px' }}>
                  <Phone size={13} color="var(--primary)" />
                  <span>{tenant.phone}</span>
                </div>
              )}
            </div>
          </div>


        </div>

        {/* Indicador de Progresso (Passos 1 a 4) */}
        {step < 5 && (
          <div
            className="glass-panel"
            style={{
              padding: '12px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            {[
              { num: 1, label: 'Serviço' },
              { num: 2, label: 'Barbeiro' },
              { num: 3, label: 'Horário' },
              { num: 4, label: 'Confirmar' },
            ].map((s, idx) => {
              const isActive = step === s.num;
              const isPassed = step > s.num;

              return (
                <div key={s.num} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      background: isActive
                        ? 'var(--primary)'
                        : isPassed
                        ? 'rgba(16, 185, 129, 0.2)'
                        : 'rgba(255, 255, 255, 0.05)',
                      color: isActive ? '#0B0F17' : isPassed ? '#10B981' : 'var(--text-dim)',
                      border: isActive
                        ? 'none'
                        : isPassed
                        ? '1px solid #10B981'
                        : '1px solid rgba(255, 255, 255, 0.1)',
                      boxShadow: isActive ? '0 0 12px var(--primary-glow)' : 'none',
                      transition: 'all 0.3s ease',
                    }}
                  >
                    {isPassed ? <Check size={14} /> : s.num}
                  </div>
                  <span
                    style={{
                      fontSize: '0.82rem',
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? 'var(--text-main)' : 'var(--text-dim)',
                    }}
                  >
                    {s.label}
                  </span>
                  {idx < 3 && (
                    <div
                      style={{
                        width: '20px',
                        height: '1px',
                        background: isPassed ? '#10B981' : 'rgba(255, 255, 255, 0.1)',
                        marginLeft: '8px',
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ───────────────── PASSO 1: Seleção de Serviço ───────────────── */}
        {step === 1 && (
          <div className="glass-panel animate-fade-in" style={{ padding: '28px' }}>
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 4px 0' }}>
                Escolha o Serviço Desejado
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
                Selecione o procedimento que deseja realizar com nossos profissionais.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {tenant.services.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                  Nenhum serviço disponível no momento.
                </div>
              ) : (
                tenant.services.map((service) => {
                  const isSelected = selectedService?.id === service.id;

                  return (
                    <div
                      key={service.id}
                      onClick={() => setSelectedService(service)}
                      style={{
                        padding: '16px 20px',
                        borderRadius: '12px',
                        background: isSelected ? 'rgba(229, 179, 56, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                        border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                        boxShadow: isSelected ? '0 0 15px rgba(229, 179, 56, 0.25)' : 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '10px',
                            background: isSelected ? 'var(--primary)' : 'rgba(255, 255, 255, 0.06)',
                            color: isSelected ? '#0B0F17' : 'var(--primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <Scissors size={20} />
                        </div>
                        <div>
                          <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 2px 0' }}>
                            {service.name}
                          </h3>
                          {service.description && (
                            <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', margin: '0 0 4px 0' }}>
                              {service.description}
                            </p>
                          )}
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={12} />
                            {service.durationMinutes} minutos de duração
                          </span>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--primary)', display: 'block' }}>
                          {formatBRL(service.priceCents)}
                        </span>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: isSelected ? 'var(--primary)' : 'var(--text-dim)',
                          }}
                        >
                          {isSelected ? '✓ Selecionado' : 'Selecionar'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <button
              disabled={!selectedService}
              onClick={() => setStep(2)}
              className="gold-gradient-primary gold-glow"
              style={{
                width: '100%',
                padding: '14px',
                marginTop: '24px',
                fontSize: '1rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                opacity: selectedService ? 1 : 0.5,
                cursor: selectedService ? 'pointer' : 'not-allowed',
              }}
            >
              <span>Avançar para Escolha do Barbeiro</span>
              <ArrowRight size={18} />
            </button>
          </div>
        )}

        {/* ───────────────── PASSO 2: Seleção de Profissional ───────────────── */}
        {step === 2 && (
          <div className="glass-panel animate-fade-in" style={{ padding: '28px' }}>
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 4px 0' }}>
                Com quem deseja ser atendido?
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
                Serviço selecionado: <strong>{selectedService?.name}</strong> ({selectedService?.durationMinutes} min)
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Opção Qualquer Profissional */}
              <div
                onClick={() => setSelectedProfessional(null)}
                style={{
                  padding: '16px 20px',
                  borderRadius: '12px',
                  background: selectedProfessional === null ? 'rgba(229, 179, 56, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                  border: selectedProfessional === null ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                  boxShadow: selectedProfessional === null ? '0 0 15px rgba(229, 179, 56, 0.25)' : 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '14px',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div
                    style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #E5B338, #966C0F)',
                      color: '#0B0F17',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                    }}
                  >
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 2px 0' }}>
                      Qualquer Profissional Disponível
                    </h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: 0 }}>
                      Mais opções de horários e atendimento mais rápido ⚡
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    border: selectedProfessional === null ? '5px solid var(--primary)' : '2px solid var(--border-color)',
                    background: '#0B0F17',
                  }}
                />
              </div>

              {/* Lista de Barbeiros Específicos */}
              {eligibleProfessionals.map((prof) => {
                const isSelected = selectedProfessional?.id === prof.id;

                return (
                  <div
                    key={prof.id}
                    onClick={() => setSelectedProfessional(prof)}
                    style={{
                      padding: '16px 20px',
                      borderRadius: '12px',
                      background: isSelected ? 'rgba(229, 179, 56, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                      border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                      boxShadow: isSelected ? '0 0 15px rgba(229, 179, 56, 0.25)' : 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '14px',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div
                        style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '50%',
                          background: prof.color || 'var(--primary)',
                          color: '#0B0F17',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '1rem',
                        }}
                      >
                        {prof.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 2px 0' }}>
                          {prof.name}
                        </h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: 0 }}>
                          Barbeiro Especialista
                        </p>
                      </div>
                    </div>

                    <div
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        border: isSelected ? '5px solid var(--primary)' : '2px solid var(--border-color)',
                        background: '#0B0F17',
                      }}
                    />
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="glass-card"
                style={{ padding: '14px 20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <ArrowLeft size={16} />
                <span>Voltar</span>
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="gold-gradient-primary gold-glow"
                style={{
                  flex: 1,
                  padding: '14px',
                  fontSize: '1rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <span>Avançar para Data e Horário</span>
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* ───────────────── PASSO 3: Data e Horário ───────────────── */}
        {step === 3 && (
          <div className="glass-panel animate-fade-in" style={{ padding: '28px' }}>
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 4px 0' }}>
                Selecione o Dia e Horário
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
                Profissional:{' '}
                <strong>{selectedProfessional ? selectedProfessional.name : 'Qualquer profissional'}</strong>
              </p>
            </div>

            {/* Carrossel de Datas */}
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>
              Próximos Dias Disponíveis
            </label>
            <div
              style={{
                display: 'flex',
                gap: '8px',
                overflowX: 'auto',
                paddingBottom: '10px',
                marginBottom: '24px',
              }}
            >
              {calendarDays.map((d) => {
                const isSelected = selectedDate === d.dateStr;

                return (
                  <div
                    key={d.dateStr}
                    onClick={() => setSelectedDate(d.dateStr)}
                    style={{
                      flex: '0 0 68px',
                      padding: '12px 6px',
                      borderRadius: '10px',
                      textAlign: 'center',
                      background: isSelected ? 'var(--primary)' : 'rgba(255, 255, 255, 0.04)',
                      color: isSelected ? '#0B0F17' : 'var(--text-main)',
                      border: isSelected ? 'none' : '1px solid var(--border-color)',
                      boxShadow: isSelected ? '0 0 15px var(--primary-glow)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <span style={{ fontSize: '0.72rem', display: 'block', fontWeight: 600, textTransform: 'uppercase', opacity: 0.85 }}>
                      {d.weekDayName}
                    </span>
                    <span style={{ fontSize: '1.35rem', fontWeight: 800, display: 'block', margin: '2px 0' }}>
                      {d.dayNum}
                    </span>
                    <span style={{ fontSize: '0.7rem', display: 'block', opacity: 0.75 }}>
                      {d.monthName}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Grid de Horários */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '10px', fontWeight: 600 }}>
                Horários Livres em {selectedDate ? selectedDate.split('-').reverse().join('/') : ''}
              </label>

              {slotsLoading ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      border: '2px solid rgba(229, 179, 56, 0.2)',
                      borderTopColor: 'var(--primary)',
                      animation: 'spin 1s linear infinite',
                      margin: '0 auto 10px auto',
                    }}
                  />
                  <span>Consultando agenda em tempo real...</span>
                </div>
              ) : isDayClosed ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '28px',
                    borderRadius: '10px',
                    background: 'rgba(244, 63, 94, 0.08)',
                    border: '1px solid rgba(244, 63, 94, 0.2)',
                    color: '#FB7185',
                  }}
                >
                  <AlertCircle size={22} style={{ margin: '0 auto 8px auto', display: 'block' }} />
                  <p style={{ margin: 0, fontWeight: 600 }}>Barbearia fechada nesta data.</p>
                  <span style={{ fontSize: '0.82rem', opacity: 0.8 }}>Por favor, selecione outro dia acima.</span>
                </div>
              ) : availableSlots.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '28px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-muted)',
                  }}
                >
                  <Clock size={22} style={{ margin: '0 auto 8px auto', display: 'block', opacity: 0.6 }} />
                  <p style={{ margin: 0, fontWeight: 600 }}>Sem horários vagos nesta data.</p>
                  <span style={{ fontSize: '0.82rem', opacity: 0.8 }}>Selecione outro dia ou tente outro profissional.</span>
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
                    gap: '10px',
                    maxHeight: '260px',
                    overflowY: 'auto',
                    paddingRight: '4px',
                  }}
                >
                  {availableSlots.map((slot) => {
                    const isSelected = selectedTime === slot.time;

                    return (
                      <button
                        key={slot.time}
                        type="button"
                        onClick={() => setSelectedTime(slot.time)}
                        style={{
                          padding: '12px 8px',
                          borderRadius: '8px',
                          fontSize: '0.95rem',
                          fontWeight: 700,
                          textAlign: 'center',
                          background: isSelected ? 'var(--primary)' : 'rgba(255, 255, 255, 0.04)',
                          color: isSelected ? '#0B0F17' : 'var(--text-main)',
                          border: isSelected ? 'none' : '1px solid var(--border-color)',
                          boxShadow: isSelected ? '0 0 12px var(--primary-glow)' : 'none',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {slot.time}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '28px' }}>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="glass-card"
                style={{ padding: '14px 20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <ArrowLeft size={16} />
                <span>Voltar</span>
              </button>
              <button
                type="button"
                disabled={!selectedTime}
                onClick={() => setStep(4)}
                className="gold-gradient-primary gold-glow"
                style={{
                  flex: 1,
                  padding: '14px',
                  fontSize: '1rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  opacity: selectedTime ? 1 : 0.5,
                  cursor: selectedTime ? 'pointer' : 'not-allowed',
                }}
              >
                <span>Avançar para Meus Dados</span>
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* ───────────────── PASSO 4: Dados do Cliente & Confirmação ───────────────── */}
        {step === 4 && (
          <div className="glass-panel animate-fade-in" style={{ padding: '28px' }}>
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 4px 0' }}>
                Quase lá! Preencha seus Dados
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
                Você receberá a confirmação e o lembrete oficial direto no seu WhatsApp.
              </p>
            </div>

            {/* Resumo do Agendamento */}
            <div
              style={{
                padding: '16px 20px',
                borderRadius: '12px',
                background: 'rgba(229, 179, 56, 0.08)',
                border: '1px solid rgba(229, 179, 56, 0.25)',
                marginBottom: '24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Resumo do Agendamento
                </span>
                <h4 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '2px 0 0 0' }}>
                  {selectedService?.name}
                </h4>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Com: <strong>{selectedProfessional ? selectedProfessional.name : 'Qualquer Profissional'}</strong>
                </p>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--primary)', display: 'block' }}>
                  {selectedDate.split('-').reverse().join('/')} às {selectedTime}
                </span>
                <span style={{ fontSize: '1.15rem', fontWeight: 800 }}>
                  {selectedService ? formatBRL(selectedService.priceCents) : ''}
                </span>
              </div>
            </div>

            {bookingError && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: 'rgba(244, 63, 94, 0.12)',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                  color: '#FB7185',
                  fontSize: '0.88rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '20px',
                }}
              >
                <AlertCircle size={18} />
                <span>{bookingError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmBooking} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500 }}>
                  Seu Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Carlos Silva"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500 }}>
                  Seu WhatsApp (com DDD) *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="Ex: (11) 99999-8888"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>
                  📲 Enviaremos o comprovante e os lembretes do horário neste número.
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500 }}>
                  Seu E-mail (opcional)
                </label>
                <input
                  type="email"
                  placeholder="carlos@exemplo.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500 }}>
                  Observações para a barbearia (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Prefiro tesoura no topo ou tenho alergia a tal produto"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="glass-card"
                  style={{ padding: '14px 20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <ArrowLeft size={16} />
                  <span>Voltar</span>
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="gold-gradient-primary gold-glow"
                  style={{
                    flex: 1,
                    padding: '14px',
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    opacity: submitting ? 0.7 : 1,
                    cursor: submitting ? 'wait' : 'pointer',
                  }}
                >
                  <span>{submitting ? 'Confirmando...' : 'Confirmar Agendamento'}</span>
                  {!submitting && <CheckCircle2 size={18} />}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ───────────────── PASSO 5: Sucesso / Concluído ───────────────── */}
        {step === 5 && confirmedData && (
          <div
            className="glass-panel animate-fade-in"
            style={{
              padding: '40px 28px',
              textAlign: 'center',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div
              style={{
                width: '68px',
                height: '68px',
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#10B981',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '20px',
                boxShadow: '0 0 25px rgba(16, 185, 129, 0.3)',
              }}
            >
              <CheckCircle2 size={36} />
            </div>

            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '6px' }}>
              Agendamento Confirmado!
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginBottom: '28px' }}>
              Parabéns, <strong>{customerName}</strong>! Seu horário na <strong>{tenant.name}</strong> está reservado.
            </p>

            <div
              className="glass-card"
              style={{
                textAlign: 'left',
                padding: '20px',
                marginBottom: '28px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', paddingBottom: '10px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Serviço</span>
                <span style={{ fontWeight: 700 }}>{selectedService?.name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', paddingBottom: '10px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Profissional</span>
                <span style={{ fontWeight: 700 }}>{confirmedData?.professional?.name || selectedProfessional?.name || 'Profissional'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', paddingBottom: '10px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Data & Horário</span>
                <span style={{ fontWeight: 700, color: 'var(--primary)' }}>
                  {selectedDate.split('-').reverse().join('/')} às {selectedTime}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Valor Estimado</span>
                <span style={{ fontWeight: 800, fontSize: '1.05rem', color: '#10B981' }}>
                  {selectedService ? formatBRL(selectedService.priceCents) : ''}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {tenant.phone && (
                <a
                  href={`https://wa.me/55${tenant.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                    `Olá! Acabei de fazer um agendamento online na ${tenant.name} para ${selectedDate.split('-').reverse().join('/')} às ${selectedTime}.`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gold-gradient-primary gold-glow"
                  style={{
                    padding: '14px',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <MessageSquare size={18} />
                  <span>Falar com a Barbearia no WhatsApp</span>
                </a>
              )}

              <button
                type="button"
                onClick={() => {
                  setSelectedService(null);
                  setSelectedProfessional(null);
                  setSelectedTime('');
                  setStep(1);
                }}
                className="glass-card"
                style={{
                  padding: '12px',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                }}
              >
                Fazer Outro Agendamento
              </button>
            </div>
          </div>
        )}

        {/* Rodapé institucional */}
        <div style={{ textAlign: 'center', marginTop: '16px', color: 'var(--text-dim)', fontSize: '0.78rem' }}>
          <span>Agendamento online seguro powered by </span>
          <Link href="/" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>
            BarberFlow SaaS
          </Link>
        </div>
      </div>
    </div>
  );
}


export default function PublicBookingPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-muted)' }}>Carregando agendamento...</span>
      </div>
    }>
      <PublicBookingContent />
    </Suspense>
  );
}
