'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  Scissors,
  CheckCircle,
  XCircle,
  Users,
  Phone,
  MessageCircle,
  DollarSign,
  PanelLeftClose,
  PanelLeftOpen,
  Check,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { Sidebar } from '../../components/Sidebar';
import { Header } from '../../components/Header';
import { Modal } from '../../components/Modal';
import { Select } from '../../components/Select';
import { TimePicker } from '../../components/TimePicker';
import { DateTime } from 'luxon';

interface Professional {
  id: string;
  name: string;
  color: string;
}

interface Service {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
}

interface Appointment {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  priceCents: number;
  notes?: string | null;
  customer: { id: string; name: string; phone?: string | null };
  service: { id: string; name: string; durationMinutes: number; priceCents: number };
  professional: { id: string; name: string; color: string };
  transaction?: { id: string; paymentMethod: string } | null;
}

type CalendarViewMode = 'week' | 'work_week' | 'day';

const START_HOUR = 7;
const END_HOUR = 22;
const HOUR_HEIGHT = 84; // pixels por hora (1 min = 1.4px, Teams style)
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

const WEEKDAY_NAMES_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const WEEKDAY_SHORT_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function getDaysForView(date: DateTime, view: CalendarViewMode): DateTime[] {
  if (view === 'day') {
    return [date.startOf('day')];
  }

  // Domingo é o início da semana (0 em pt-BR/Teams)
  // No Luxon: weekday 7 é Domingo, weekday 1 é Segunda
  const sunday = date.weekday === 7 ? date.startOf('day') : date.minus({ days: date.weekday }).startOf('day');

  if (view === 'work_week') {
    // Segunda a Sexta (5 dias)
    return [1, 2, 3, 4, 5].map((offset) => sunday.plus({ days: offset }));
  }

  // Semana completa (7 dias: Domingo a Sábado)
  return [0, 1, 2, 3, 4, 5, 6].map((offset) => sunday.plus({ days: offset }));
}

function layoutDayAppointments(apps: Appointment[]) {
  const sorted = [...apps].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
  );

  const columns: Appointment[][] = [];

  sorted.forEach((app) => {
    let placed = false;
    const appStart = new Date(app.startAt).getTime();
    for (let i = 0; i < columns.length; i++) {
      const lastApp = columns[i][columns[i].length - 1];
      if (new Date(lastApp.endAt).getTime() <= appStart) {
        columns[i].push(app);
        placed = true;
        break;
      }
    }
    if (!placed) {
      columns.push([app]);
    }
  });

  const result: { app: Appointment; colIndex: number; totalCols: number }[] = [];
  columns.forEach((col, colIndex) => {
    col.forEach((app) => {
      const appStart = new Date(app.startAt).getTime();
      const appEnd = new Date(app.endAt).getTime();
      let overlappingCols = 0;
      columns.forEach((otherCol) => {
        if (
          otherCol.some((o) => {
            const oStart = new Date(o.startAt).getTime();
            const oEnd = new Date(o.endAt).getTime();
            return oStart < appEnd && oEnd > appStart;
          })
        ) {
          overlappingCols++;
        }
      });
      result.push({ app, colIndex, totalCols: Math.max(1, overlappingCols) });
    });
  });

  return result;
}

export default function CalendarPage() {
  const { tenant } = useAuth();
  const timezone = tenant?.timezone || 'America/Sao_Paulo';

  const [selectedDate, setSelectedDate] = useState<DateTime>(DateTime.now().setZone(timezone));
  const [viewMode, setViewMode] = useState<CalendarViewMode>('week');
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);

  // Mês exibido no mini-calendário lateral
  const [miniCalendarMonth, setMiniCalendarMonth] = useState<DateTime>(
    DateTime.now().setZone(timezone).startOf('month')
  );

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedProfId, setSelectedProfId] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);

  // Modais
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState<Appointment | null>(null);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('PIX');

  // Form novo agendamento
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [newServiceId, setNewServiceId] = useState('');
  const [newProfId, setNewProfId] = useState('');
  const [newTime, setNewTime] = useState('10:00');
  const [newNotes, setNewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const gridScrollRef = useRef<HTMLDivElement>(null);

  // Dias da visão atual
  const visibleDays = useMemo(() => getDaysForView(selectedDate, viewMode), [selectedDate, viewMode]);

  // Carrega agendamentos para todo o período da visão ativa
  const loadData = async () => {
    setLoading(true);
    try {
      const startDate = visibleDays[0].startOf('day').toISO()!;
      const endDate = visibleDays[visibleDays.length - 1].endOf('day').toISO()!;

      const [appsRes, profsRes, servsRes] = await Promise.all([
        api.get<{ appointments: Appointment[] }>(
          `/api/appointments?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
        ),
        api.get<{ professionals: Professional[] }>('/api/professionals?active=true'),
        api.get<{ services: Service[] }>('/api/services?active=true'),
      ]);

      setAppointments(appsRes.appointments || []);
      setProfessionals(profsRes.professionals || []);
      setServices(servsRes.services || []);
      if (servsRes.services?.length && !newServiceId) {
        setNewServiceId(servsRes.services[0].id);
      }
    } catch {
      // Ignora erro
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDate, viewMode]);

  // Sincroniza mês do mini-calendário quando selectedDate mudar muito
  useEffect(() => {
    if (selectedDate.month !== miniCalendarMonth.month || selectedDate.year !== miniCalendarMonth.year) {
      setMiniCalendarMonth(selectedDate.startOf('month'));
    }
  }, [selectedDate]);

  // Auto-scroll inicial para perto do horário de abertura (08:00) ou horário atual
  useEffect(() => {
    if (gridScrollRef.current) {
      const now = DateTime.now().setZone(timezone);
      const targetHour = Math.max(START_HOUR, Math.min(18, now.hour - 1));
      gridScrollRef.current.scrollTop = (targetHour - START_HOUR) * HOUR_HEIGHT;
    }
  }, [viewMode]);

  const handlePrev = () => {
    if (viewMode === 'day') {
      setSelectedDate((d) => d.minus({ days: 1 }));
    } else {
      setSelectedDate((d) => d.minus({ weeks: 1 }));
    }
  };

  const handleNext = () => {
    if (viewMode === 'day') {
      setSelectedDate((d) => d.plus({ days: 1 }));
    } else {
      setSelectedDate((d) => d.plus({ weeks: 1 }));
    }
  };

  const handleToday = () => {
    const today = DateTime.now().setZone(timezone);
    setSelectedDate(today);
    setMiniCalendarMonth(today.startOf('month'));
  };

  const filteredAppointments = useMemo(() => {
    return appointments.filter((a) => {
      if (selectedProfId === 'ALL') return true;
      return a.professional.id === selectedProfId;
    });
  }, [appointments, selectedProfId]);

  const handleCellClick = (day: DateTime, hour: number) => {
    setSelectedDate(day);
    setNewTime(`${String(hour).padStart(2, '0')}:00`);
    setIsNewModalOpen(true);
  };

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const [h, m] = newTime.split(':').map(Number);
      const startAt = selectedDate.set({ hour: h, minute: m, second: 0, millisecond: 0 }).toJSDate();

      await api.post('/api/appointments', {
        serviceId: newServiceId,
        professionalId: newProfId || null,
        startAt,
        customerName,
        customerPhone,
        notes: newNotes,
      });

      setIsNewModalOpen(false);
      setCustomerName('');
      setCustomerPhone('');
      setNewNotes('');
      await loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Falha ao agendar horário.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteAppointment = async () => {
    if (!selectedApp) return;
    try {
      await api.patch(`/api/appointments/${selectedApp.id}/status`, {
        status: 'COMPLETED',
        paymentMethod,
      });
      setIsStatusModalOpen(false);
      setSelectedApp(null);
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof ApiError ? err.message : 'Falha ao concluir agendamento.');
    }
  };

  const handleCancelAppointment = async () => {
    if (!selectedApp) return;
    if (!confirm('Deseja realmente cancelar este agendamento?')) return;
    try {
      await api.delete(`/api/appointments/${selectedApp.id}`);
      setIsStatusModalOpen(false);
      setSelectedApp(null);
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof ApiError ? err.message : 'Falha ao cancelar agendamento.');
    }
  };

  const formatBRL = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  };

  // Cálculo da Linha de Horário Atual (estilo Microsoft Teams)
  const now = DateTime.now().setZone(timezone);
  const isCurrentTimeInRange = now.hour >= START_HOUR && now.hour < END_HOUR;
  const currentMinutesFromStart = (now.hour - START_HOUR) * 60 + now.minute;
  const currentTimeTop = (currentMinutesFromStart / 60) * HOUR_HEIGHT;

  // Título do intervalo atual no topo (ex: "18 – 24 de Outubro de 2026")
  const dateRangeTitle = useMemo(() => {
    if (viewMode === 'day') {
      return selectedDate.toFormat("cccc, dd 'de' MMMM 'de' yyyy", { locale: 'pt-BR' });
    }
    const firstDay = visibleDays[0];
    const lastDay = visibleDays[visibleDays.length - 1];
    if (firstDay.month === lastDay.month) {
      return `${firstDay.day} – ${lastDay.day} de ${firstDay.toFormat('MMMM de yyyy', { locale: 'pt-BR' })}`;
    }
    return `${firstDay.day} de ${firstDay.toFormat('MMM', { locale: 'pt-BR' })} – ${lastDay.day} de ${lastDay.toFormat("MMM 'de' yyyy", { locale: 'pt-BR' })}`;
  }, [visibleDays, viewMode, selectedDate]);

  // Mini-calendário: matriz de dias do mês
  const miniCalendarDays = useMemo(() => {
    const firstOfMonth = miniCalendarMonth.startOf('month');
    const startOfGrid =
      firstOfMonth.weekday === 7
        ? firstOfMonth
        : firstOfMonth.minus({ days: firstOfMonth.weekday }).startOf('day');

    return Array.from({ length: 42 }, (_, i) => startOfGrid.plus({ days: i }));
  }, [miniCalendarMonth]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-main)' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Header />

        {/* Microsoft Teams Style Layout Container */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: 'calc(100vh - 65px)' }}>
          {/* Painel Lateral Estilo Microsoft Teams (Mini Calendário + Filtros) */}
          {showLeftSidebar && (
            <aside
              style={{
                width: '280px',
                borderRight: '1px solid var(--border-color)',
                background: 'rgba(11, 15, 23, 0.95)',
                display: 'flex',
                flexDirection: 'column',
                flexShrink: 0,
                overflowY: 'auto',
                padding: '18px 16px',
                gap: '20px',
              }}
            >
              {/* Header do painel com botão de recolher */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CalendarIcon size={18} color="var(--primary)" />
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: '#F3F4F6' }}>
                    Calendário
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLeftSidebar(false)}
                  title="Recolher painel"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-dim)',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <PanelLeftClose size={18} />
                </button>
              </div>

              {/* Botão Novo Agendamento no Painel */}
              <button
                type="button"
                onClick={() => {
                  setSelectedDate(DateTime.now().setZone(timezone));
                  setIsNewModalOpen(true);
                }}
                className="gold-gradient-primary gold-glow"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  border: 'none',
                }}
              >
                <Plus size={16} />
                <span>Novo Agendamento</span>
              </button>

              {/* Mini Calendário Mensal (Teams Style) */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  padding: '14px',
                }}
              >
                {/* Navegação do Mês */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '12px',
                  }}
                >
                  <span style={{ fontSize: '0.88rem', fontWeight: 700, textTransform: 'capitalize', color: '#F3F4F6' }}>
                    {miniCalendarMonth.toFormat('MMMM yyyy', { locale: 'pt-BR' })}
                  </span>
                  <div style={{ display: 'flex', gap: '2px' }}>
                    <button
                      type="button"
                      onClick={() => setMiniCalendarMonth((m) => m.minus({ months: 1 }))}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        padding: '4px',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setMiniCalendarMonth((m) => m.plus({ months: 1 }))}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        padding: '4px',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>

                {/* Siglas dos Dias */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, 1fr)',
                    textAlign: 'center',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: 'var(--text-dim)',
                    marginBottom: '6px',
                  }}
                >
                  <span>D</span>
                  <span>S</span>
                  <span>T</span>
                  <span>Q</span>
                  <span>Q</span>
                  <span>S</span>
                  <span>S</span>
                </div>

                {/* Grade de Dias */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, 1fr)',
                    gap: '2px',
                  }}
                >
                  {miniCalendarDays.slice(0, 35).map((d, idx) => {
                    const isCurrentMonth = d.month === miniCalendarMonth.month;
                    const isToday = d.hasSame(now, 'day');
                    const isSelected = d.hasSame(selectedDate, 'day');
                    const isInCurrentView = visibleDays.some((vd) => vd.hasSame(d, 'day'));

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedDate(d)}
                        style={{
                          height: '28px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.78rem',
                          fontWeight: isToday || isSelected ? 700 : 500,
                          borderRadius: isSelected || isToday ? '6px' : '4px',
                          border: isToday ? '1px solid var(--primary)' : 'none',
                          background: isSelected
                            ? 'var(--primary)'
                            : isInCurrentView
                            ? 'rgba(229, 179, 56, 0.15)'
                            : 'transparent',
                          color: isSelected
                            ? '#0B0F17'
                            : isToday
                            ? 'var(--primary)'
                            : isCurrentMonth
                            ? '#F3F4F6'
                            : 'var(--text-dim)',
                          cursor: 'pointer',
                          transition: 'all 0.1s',
                          opacity: isCurrentMonth ? 1 : 0.4,
                        }}
                      >
                        {d.day}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Filtro de Profissionais (Teams Style - Meus Calendários) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', padding: '0 2px' }}>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--text-dim)',
                    }}
                  >
                    Profissionais
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {professionals.length}
                  </span>
                </div>

                {/* Opção: Todos os Profissionais */}
                <button
                  type="button"
                  onClick={() => setSelectedProfId('ALL')}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    background: selectedProfId === 'ALL' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                    transition: 'background 0.15s ease',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => {
                    if (selectedProfId !== 'ALL') e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                  }}
                  onMouseLeave={(e) => {
                    if (selectedProfId !== 'ALL') e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                    {/* Checkbox customizado estilo Teams */}
                    <div
                      style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '3px',
                        flexShrink: 0,
                        background: selectedProfId === 'ALL' ? 'var(--primary)' : 'transparent',
                        border: selectedProfId === 'ALL' ? 'none' : '1.5px solid rgba(255, 255, 255, 0.35)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {selectedProfId === 'ALL' && <Check size={12} color="#0B0F17" strokeWidth={3} />}
                    </div>

                    <span
                      style={{
                        fontSize: '0.84rem',
                        fontWeight: selectedProfId === 'ALL' ? 700 : 500,
                        color: selectedProfId === 'ALL' ? '#FFFFFF' : 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      Todos os Profissionais
                    </span>
                  </div>

                  {appointments.length > 0 && (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        padding: '1px 6px',
                        borderRadius: '10px',
                        background: 'rgba(255, 255, 255, 0.06)',
                        color: 'var(--text-dim)',
                        fontWeight: 600,
                        marginLeft: '6px',
                        flexShrink: 0,
                      }}
                    >
                      {appointments.length}
                    </span>
                  )}
                </button>

                {/* Lista de Profissionais */}
                {professionals.map((p) => {
                  const isSelected = selectedProfId === p.id;
                  const profAppsCount = appointments.filter((a) => a.professional.id === p.id).length;
                  const itemColor = p.color || 'var(--primary)';

                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedProfId(p.id)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: 'none',
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                        transition: 'background 0.15s ease',
                        textAlign: 'left',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                        {/* Checkbox customizado com a cor do barbeiro */}
                        <div
                          style={{
                            width: '16px',
                            height: '16px',
                            borderRadius: '3px',
                            flexShrink: 0,
                            background: isSelected ? itemColor : 'transparent',
                            border: isSelected ? 'none' : '1.5px solid rgba(255, 255, 255, 0.35)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {isSelected && <Check size={12} color="#0B0F17" strokeWidth={3} />}
                        </div>

                        <span
                          style={{
                            fontSize: '0.84rem',
                            fontWeight: isSelected ? 700 : 500,
                            color: isSelected ? '#FFFFFF' : 'var(--text-muted)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {p.name}
                        </span>
                      </div>

                      {profAppsCount > 0 && (
                        <span
                          style={{
                            fontSize: '0.72rem',
                            padding: '1px 6px',
                            borderRadius: '10px',
                            background: 'rgba(255, 255, 255, 0.06)',
                            color: 'var(--text-dim)',
                            fontWeight: 600,
                            marginLeft: '6px',
                            flexShrink: 0,
                          }}
                        >
                          {profAppsCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </aside>
          )}

          {/* Área Principal do Calendário */}
          <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg-main)' }}>
            {/* Barra de Comandos Superior (Teams Header Bar) */}
            <div
              style={{
                height: '56px',
                borderBottom: '1px solid var(--border-color)',
                background: 'rgba(15, 18, 25, 0.95)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 20px',
                gap: '12px',
                flexShrink: 0,
              }}
            >
              {/* Controles de Navegação */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {!showLeftSidebar && (
                  <button
                    type="button"
                    onClick={() => setShowLeftSidebar(true)}
                    title="Exibir painel lateral"
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      marginRight: '6px',
                    }}
                  >
                    <PanelLeftOpen size={16} />
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleToday}
                  className="glass-card"
                  style={{
                    padding: '6px 14px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  Hoje
                </button>

                <div style={{ display: 'flex', gap: '2px' }}>
                  <button
                    type="button"
                    onClick={handlePrev}
                    title="Anterior"
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px 0 0 6px',
                      padding: '6px 10px',
                      color: 'var(--text-main)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    title="Próximo"
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border-color)',
                      borderLeft: 'none',
                      borderRadius: '0 6px 6px 0',
                      padding: '6px 10px',
                      color: 'var(--text-main)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                {/* Título do Período Atual */}
                <h2
                  style={{
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    color: '#F3F4F6',
                    margin: '0 0 0 10px',
                    textTransform: 'capitalize',
                  }}
                >
                  {dateRangeTitle}
                </h2>
              </div>

              {/* Lado Direito: Filtro de Profissionais + Seletor de Visão + Botão Novo */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {/* Filtro Rápido de Profissionais no Topo */}
                <div style={{ width: '185px' }}>
                  <Select
                    value={selectedProfId}
                    onChange={(e) => setSelectedProfId(e.target.value)}
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.82rem',
                      height: '34px',
                    }}
                  >
                    <option value="ALL">Todos os Profissionais</option>
                    {professionals.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </div>

                {/* Seletor de Visão (Teams Style) */}
                <div
                  style={{
                    display: 'flex',
                    background: 'rgba(0, 0, 0, 0.45)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '3px',
                    gap: '2px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setViewMode('day')}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '5px',
                      fontSize: '0.78rem',
                      fontWeight: viewMode === 'day' ? 700 : 500,
                      border: 'none',
                      cursor: 'pointer',
                      background: viewMode === 'day' ? 'var(--primary)' : 'transparent',
                      color: viewMode === 'day' ? '#0B0F17' : 'var(--text-muted)',
                      transition: 'all 0.15s',
                    }}
                  >
                    Dia
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('work_week')}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '5px',
                      fontSize: '0.78rem',
                      fontWeight: viewMode === 'work_week' ? 700 : 500,
                      border: 'none',
                      cursor: 'pointer',
                      background: viewMode === 'work_week' ? 'var(--primary)' : 'transparent',
                      color: viewMode === 'work_week' ? '#0B0F17' : 'var(--text-muted)',
                      transition: 'all 0.15s',
                    }}
                  >
                    Semana de Trabalho
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('week')}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '5px',
                      fontSize: '0.78rem',
                      fontWeight: viewMode === 'week' ? 700 : 500,
                      border: 'none',
                      cursor: 'pointer',
                      background: viewMode === 'week' ? 'var(--primary)' : 'transparent',
                      color: viewMode === 'week' ? '#0B0F17' : 'var(--text-muted)',
                      transition: 'all 0.15s',
                    }}
                  >
                    Semana
                  </button>
                </div>

                {/* Botão Novo Agendamento no topo */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate(DateTime.now().setZone(timezone));
                    setIsNewModalOpen(true);
                  }}
                  className="gold-gradient-primary"
                  style={{
                    padding: '7px 14px',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    border: 'none',
                  }}
                >
                  <Plus size={15} />
                  <span>Novo</span>
                </button>
              </div>
            </div>

            {/* Timetable Grid (Grade Horária Estilo Microsoft Teams) */}
            <div
              ref={gridScrollRef}
              className="custom-scrollbar"
              style={{
                flex: 1,
                overflowY: 'auto',
                overflowX: 'auto',
                position: 'relative',
                background: '#0B0F17',
              }}
            >
              <div style={{ minWidth: viewMode === 'day' ? '400px' : '750px', display: 'flex', flexDirection: 'column' }}>
                {/* Linha Fixa Superior dos Dias (Teams Day Headers) */}
                <div
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 20,
                    background: '#0E121B',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'grid',
                    gridTemplateColumns: `60px repeat(${visibleDays.length}, 1fr)`,
                    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)',
                  }}
                >
                  {/* Célula Vazia do canto do fuso/horas */}
                  <div
                    style={{
                      borderRight: '1px solid var(--border-color)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-dim)',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                    }}
                  >
                    <Clock size={13} />
                  </div>

                  {/* Colunas dos Dias */}
                  {visibleDays.map((d) => {
                    const isToday = d.hasSame(now, 'day');
                    const isSelected = d.hasSame(selectedDate, 'day');

                    return (
                      <div
                        key={d.toISODate()}
                        onClick={() => setSelectedDate(d)}
                        style={{
                          padding: '10px 8px',
                          textAlign: 'center',
                          borderRight: '1px solid rgba(255, 255, 255, 0.05)',
                          cursor: 'pointer',
                          background: isToday
                            ? 'rgba(229, 179, 56, 0.12)'
                            : isSelected
                            ? 'rgba(255, 255, 255, 0.03)'
                            : 'transparent',
                          borderTop: isToday ? '3px solid var(--primary)' : '3px solid transparent',
                          transition: 'all 0.15s',
                        }}
                      >
                        <div
                          style={{
                            display: 'inline-flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '2px',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '0.74rem',
                              fontWeight: 600,
                              color: isToday ? 'var(--primary)' : 'var(--text-dim)',
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                            }}
                          >
                            {WEEKDAY_SHORT_PT[d.weekday % 7]}
                          </span>

                          <span
                            style={{
                              fontSize: '1.25rem',
                              fontWeight: 800,
                              color: isToday ? 'var(--primary)' : '#F3F4F6',
                              lineHeight: 1,
                            }}
                          >
                            {d.day}
                          </span>

                          {isToday && (
                            <span
                              style={{
                                fontSize: '0.62rem',
                                fontWeight: 800,
                                color: '#0B0F17',
                                background: 'var(--primary)',
                                padding: '1px 5px',
                                borderRadius: '3px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                                marginTop: '2px',
                              }}
                            >
                              Hoje
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Grade Principal com Linhas de Horário e Eventos */}
                <div
                  style={{
                    position: 'relative',
                    display: 'grid',
                    gridTemplateColumns: `60px repeat(${visibleDays.length}, 1fr)`,
                    height: `${HOURS.length * HOUR_HEIGHT}px`,
                  }}
                >
                  {/* Eixo Y das Horas (Coluna Esquerda) */}
                  <div
                    style={{
                      borderRight: '1px solid var(--border-color)',
                      background: 'rgba(11, 15, 23, 0.85)',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    {HOURS.map((hr) => (
                      <div
                        key={hr}
                        style={{
                          height: `${HOUR_HEIGHT}px`,
                          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'flex-end',
                          paddingRight: '8px',
                          paddingTop: '4px',
                          fontSize: '0.74rem',
                          color: 'var(--text-dim)',
                          fontFamily: 'monospace, monospace',
                          fontWeight: 600,
                        }}
                      >
                        {String(hr).padStart(2, '0')}:00
                      </div>
                    ))}
                  </div>

                  {/* Colunas dos Dias com Linhas de Fundo e Agendamentos */}
                  {visibleDays.map((d, colIndex) => {
                    const isToday = d.hasSame(now, 'day');
                    const dayApps = filteredAppointments.filter((a) => {
                      const appDate = DateTime.fromISO(a.startAt, { zone: timezone });
                      return appDate.hasSame(d, 'day');
                    });
                    const laidOutApps = layoutDayAppointments(dayApps);

                    return (
                      <div
                        key={d.toISODate()}
                        style={{
                          position: 'relative',
                          borderRight: '1px solid rgba(255, 255, 255, 0.05)',
                          background: isToday ? 'rgba(229, 179, 56, 0.02)' : 'transparent',
                        }}
                      >
                        {/* Linhas Horizontais de Cada Hora */}
                        {HOURS.map((hr) => (
                          <div
                            key={hr}
                            onClick={() => handleCellClick(d, hr)}
                            title={`Clique para agendar em ${d.toFormat('dd/MM')} às ${String(hr).padStart(2, '0')}:00`}
                            style={{
                              height: `${HOUR_HEIGHT}px`,
                              borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                              cursor: 'pointer',
                              position: 'relative',
                              transition: 'background 0.15s ease',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(229, 179, 56, 0.06)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            {/* Linha discreta de meia hora (:30) */}
                            <div
                              style={{
                                position: 'absolute',
                                top: `${HOUR_HEIGHT / 2}px`,
                                left: 0,
                                right: 0,
                                borderBottom: '1px dashed rgba(255, 255, 255, 0.025)',
                              }}
                            />
                          </div>
                        ))}

                        {/* Linha Indicadora do Horário Atual (Signature Teams Feature) */}
                        {isToday && isCurrentTimeInRange && (
                          <div
                            style={{
                              position: 'absolute',
                              top: `${currentTimeTop}px`,
                              left: 0,
                              right: 0,
                              height: '2px',
                              background: 'var(--primary)',
                              zIndex: 15,
                              boxShadow: '0 0 8px rgba(229, 179, 56, 0.6)',
                              pointerEvents: 'none',
                            }}
                          >
                            {/* Ponto indicador esquerdo */}
                            <div
                              style={{
                                position: 'absolute',
                                left: '-4px',
                                top: '-4px',
                                width: '10px',
                                height: '10px',
                                borderRadius: '50%',
                                background: 'var(--primary)',
                                boxShadow: '0 0 10px var(--primary)',
                              }}
                            />
                          </div>
                        )}

                        {/* Cards de Agendamento Posicionados na Grade (Teams Events) */}
                        {laidOutApps.map(({ app, colIndex: appCol, totalCols }) => {
                          const startDateTime = DateTime.fromISO(app.startAt, { zone: timezone });
                          const endDateTime = DateTime.fromISO(app.endAt, { zone: timezone });

                          // Cálculo de posicionamento vertical (top e height)
                          const startMinutes = (startDateTime.hour - START_HOUR) * 60 + startDateTime.minute;
                          const durationMinutes = Math.max(
                            15,
                            endDateTime.diff(startDateTime, 'minutes').minutes
                          );

                          const top = (startMinutes / 60) * HOUR_HEIGHT;
                          // Altura com mínimo garantido de 44px para acomodar com folga horário e nome do cliente
                          const height = Math.max(44, (durationMinutes / 60) * HOUR_HEIGHT - 2);

                          // Cálculo de posicionamento horizontal (lado a lado se sobrepor)
                          const widthPercent = 100 / totalCols;
                          const leftPercent = appCol * widthPercent;

                          const isCompleted = app.status === 'COMPLETED';
                          const isCanceled = app.status === 'CANCELED';
                          const profColor = app.professional.color || '#E5B338';

                          return (
                            <div
                              key={app.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedApp(app);
                                setIsStatusModalOpen(true);
                              }}
                              title={`${app.customer.name}\n${app.service.name} (${app.service.durationMinutes} min) - ${formatBRL(app.priceCents)}\n${startDateTime.toFormat('HH:mm')} - ${endDateTime.toFormat('HH:mm')}\nProfissional: ${app.professional.name}\nStatus: ${app.status}`}
                              style={{
                                position: 'absolute',
                                top: `${top}px`,
                                height: `${height}px`,
                                left: `calc(${leftPercent}% + 2px)`,
                                width: `calc(${widthPercent}% - 4px)`,
                                background: isCanceled
                                  ? 'rgba(244, 63, 94, 0.16)'
                                  : isCompleted
                                  ? 'rgba(16, 185, 129, 0.16)'
                                  : 'rgba(24, 30, 44, 0.95)',
                                border: `1px solid ${
                                  isCanceled
                                    ? 'rgba(244, 63, 94, 0.4)'
                                    : isCompleted
                                    ? 'rgba(16, 185, 129, 0.4)'
                                    : 'rgba(255, 255, 255, 0.12)'
                                }`,
                                borderLeft: `4px solid ${isCanceled ? '#F43F5E' : profColor}`,
                                borderRadius: '6px',
                                padding: height > 60 ? '6px 8px' : '4px 7px',
                                cursor: 'pointer',
                                zIndex: 10,
                                overflow: 'hidden',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: height > 75 ? 'space-between' : 'flex-start',
                                gap: '2px',
                                transition: 'all 0.15s ease',
                                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'translateY(-1px) scale(1.01)';
                                e.currentTarget.style.zIndex = '30';
                                e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.7)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'none';
                                e.currentTarget.style.zIndex = '10';
                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.4)';
                              }}
                            >
                              <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                {/* Linha 1: Horário e Status */}
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '4px',
                                    lineHeight: 1.15,
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: 'monospace, monospace',
                                      fontSize: height > 55 ? '0.74rem' : '0.68rem',
                                      fontWeight: 700,
                                      color: 'rgba(255, 255, 255, 0.88)',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {startDateTime.toFormat('HH:mm')} - {endDateTime.toFormat('HH:mm')}
                                  </span>

                                  {isCompleted && (
                                    <span
                                      style={{
                                        color: '#10B981',
                                        fontSize: '0.64rem',
                                        fontWeight: 800,
                                        background: 'rgba(16, 185, 129, 0.2)',
                                        padding: '1px 5px',
                                        borderRadius: '3px',
                                        lineHeight: 1,
                                      }}
                                    >
                                      ✓ CONCLUÍDO
                                    </span>
                                  )}
                                  {isCanceled && (
                                    <span
                                      style={{
                                        color: '#FB7185',
                                        fontSize: '0.62rem',
                                        fontWeight: 800,
                                        background: 'rgba(244, 63, 94, 0.2)',
                                        padding: '1px 5px',
                                        borderRadius: '3px',
                                        lineHeight: 1,
                                      }}
                                    >
                                      CANCELADO
                                    </span>
                                  )}
                                </div>

                                {/* Linha 2: Nome do Cliente (EM DESTAQUE, TOTALMENTE VISÍVEL) */}
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'baseline',
                                    gap: '6px',
                                    fontWeight: 700,
                                    fontSize: height > 55 ? '0.84rem' : '0.78rem',
                                    color: '#FFFFFF',
                                    lineHeight: 1.25,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                >
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {app.customer.name}
                                  </span>
                                  {/* Em slots compactos (<= 55px), exibe o serviço ao lado se couber */}
                                  {height <= 55 && app.service?.name && (
                                    <span
                                      style={{
                                        fontWeight: 500,
                                        fontSize: '0.70rem',
                                        color: 'var(--text-muted)',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      • {app.service.name}
                                    </span>
                                  )}
                                </div>

                                {/* Linha 3: Serviço e Barbeiro (quando houver mais altura, > 55px) */}
                                {height > 55 && (
                                  <div
                                    style={{
                                      fontSize: '0.73rem',
                                      color: 'var(--text-muted)',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      lineHeight: 1.2,
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                    }}
                                  >
                                    <span>{app.service.name}</span>
                                    <span>•</span>
                                    <span>{app.professional.name}</span>
                                  </div>
                                )}
                              </div>

                              {/* Rodapé com Preço e Duração (se houver altura suficiente, > 75px) */}
                              {height > 75 && (
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    paddingTop: '3px',
                                    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                                    fontSize: '0.74rem',
                                    lineHeight: 1.2,
                                  }}
                                >
                                  <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>
                                    {app.service.durationMinutes}m
                                  </span>
                                  <strong style={{ color: 'var(--primary)', fontWeight: 700 }}>
                                    {formatBRL(app.priceCents)}
                                  </strong>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Modal: Novo Agendamento */}
      <Modal isOpen={isNewModalOpen} onClose={() => setIsNewModalOpen(false)} title="Novo Agendamento">
        {errorMsg && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'rgba(244, 63, 94, 0.12)',
              border: '1px solid rgba(244, 63, 94, 0.25)',
              color: '#FB7185',
              fontSize: '0.85rem',
              marginBottom: '16px',
            }}
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleCreateAppointment} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Data Selecionada
            </label>
            <div
              style={{
                padding: '9px 12px',
                background: 'rgba(0, 0, 0, 0.35)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                fontSize: '0.9rem',
                color: '#F3F4F6',
                fontWeight: 600,
                textTransform: 'capitalize',
              }}
            >
              {selectedDate.toFormat("cccc, dd 'de' MMMM 'de' yyyy", { locale: 'pt-BR' })}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Nome do Cliente *
            </label>
            <input
              type="text"
              required
              placeholder="Nome completo do cliente"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              WhatsApp do Cliente
            </label>
            <input
              type="text"
              placeholder="(11) 99999-8888"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Serviço *
              </label>
              <Select required value={newServiceId} onChange={(e) => setNewServiceId(e.target.value)}>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.durationMinutes} min - {formatBRL(s.priceCents)})
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Profissional
              </label>
              <Select value={newProfId} onChange={(e) => setNewProfId(e.target.value)}>
                <option value="">Qualquer Disponível</option>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Horário de Início *
            </label>
            <TimePicker value={newTime} onChange={setNewTime} placeholder="10:00" />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Observações (Opcional)
            </label>
            <input
              type="text"
              placeholder="Ex: Preferência por máquina ou acabamento navalhado"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
            <button
              type="button"
              onClick={() => setIsNewModalOpen(false)}
              className="glass-card"
              style={{ padding: '12px 18px', fontWeight: 600 }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="gold-gradient-primary gold-glow"
              style={{ flex: 1, padding: '12px', fontWeight: 600 }}
            >
              {submitting ? 'Salvando...' : 'Confirmar Agendamento'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Detalhes & Concluir Atendimento */}
      <Modal isOpen={isStatusModalOpen} onClose={() => setIsStatusModalOpen(false)} title="Detalhes do Agendamento">
        {selectedApp && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="glass-card" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  {selectedApp.customer.name}
                </span>
                <span style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--primary)' }}>
                  {formatBRL(selectedApp.priceCents)}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                <Scissors size={15} color="var(--primary)" />
                <span>{selectedApp.service.name}</span>
                <span>•</span>
                <span style={{ color: selectedApp.professional.color || 'var(--primary)', fontWeight: 600 }}>
                  {selectedApp.professional.name}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                <Clock size={14} />
                <span>
                  {DateTime.fromISO(selectedApp.startAt, { zone: timezone }).toFormat("cccc, dd 'de' MMMM", { locale: 'pt-BR' })}
                  {' às '}
                  <strong style={{ color: '#F3F4F6' }}>
                    {DateTime.fromISO(selectedApp.startAt, { zone: timezone }).toFormat('HH:mm')} -{' '}
                    {DateTime.fromISO(selectedApp.endAt, { zone: timezone }).toFormat('HH:mm')}
                  </strong>
                </span>
              </div>

              {selectedApp.customer.phone && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                    <Phone size={14} />
                    <span>{selectedApp.customer.phone}</span>
                  </div>
                  <a
                    href={`https://wa.me/${selectedApp.customer.phone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '0.78rem',
                      color: '#25D366',
                      fontWeight: 600,
                    }}
                  >
                    <MessageCircle size={14} />
                    <span>Abrir WhatsApp</span>
                  </a>
                </div>
              )}
            </div>

            {selectedApp.status !== 'COMPLETED' && selectedApp.status !== 'CANCELED' && (
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>
                  Forma de Pagamento (lançamento automático no Caixa):
                </label>
                <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  <option value="PIX">Pix</option>
                  <option value="CREDIT_CARD">Cartão de Crédito</option>
                  <option value="DEBIT_CARD">Cartão de Débito</option>
                  <option value="CASH">Dinheiro em Espécie</option>
                  <option value="TRANSFER">Transferência Bancária</option>
                  <option value="OTHER">Outro</option>
                </Select>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              {selectedApp.status !== 'COMPLETED' && selectedApp.status !== 'CANCELED' && (
                <>
                  <button
                    type="button"
                    onClick={handleCancelAppointment}
                    className="glass-card"
                    style={{ padding: '12px 16px', color: '#FB7185', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <XCircle size={16} />
                    <span>Cancelar Horário</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCompleteAppointment}
                    className="gold-gradient-primary gold-glow"
                    style={{ flex: 1, padding: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <CheckCircle size={16} />
                    <span>Concluir & Lançar Receita</span>
                  </button>
                </>
              )}

              {selectedApp.status === 'COMPLETED' && (
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: 'rgba(16, 185, 129, 0.12)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#34D399',
                    fontSize: '0.9rem',
                    textAlign: 'center',
                    width: '100%',
                    fontWeight: 600,
                  }}
                >
                  ✓ Atendimento concluído e registrado no fluxo de caixa
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
