'use client';

import React, { useEffect, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  User,
  Scissors,
  CheckCircle,
  XCircle,
  Filter,
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

export default function CalendarPage() {
  const { tenant } = useAuth();
  const timezone = tenant?.timezone || 'America/Sao_Paulo';

  const [selectedDate, setSelectedDate] = useState<DateTime>(DateTime.now().setZone(timezone));
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

  const loadData = async () => {
    setLoading(true);
    try {
      const dateStr = selectedDate.toISODate()!;
      const startOfDay = selectedDate.startOf('day').toISO()!;
      const endOfDay = selectedDate.endOf('day').toISO()!;

      const [appsRes, profsRes, servsRes] = await Promise.all([
        api.get<{ appointments: Appointment[] }>(
          `/api/appointments?startDate=${encodeURIComponent(startOfDay)}&endDate=${encodeURIComponent(endOfDay)}`,
        ),
        api.get<{ professionals: Professional[] }>('/api/professionals?active=true'),
        api.get<{ services: Service[] }>('/api/services?active=true'),
      ]);

      setAppointments(appsRes.appointments);
      setProfessionals(profsRes.professionals);
      setServices(servsRes.services);
      if (servsRes.services.length && !newServiceId) setNewServiceId(servsRes.services[0].id);
    } catch {
      // Ignora erro
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  const handlePrevDay = () => setSelectedDate((d) => d.minus({ days: 1 }));
  const handleNextDay = () => setSelectedDate((d) => d.plus({ days: 1 }));
  const handleToday = () => setSelectedDate(DateTime.now().setZone(timezone));

  const filteredAppointments = appointments.filter((a) => {
    if (selectedProfId === 'ALL') return true;
    return a.professional.id === selectedProfId;
  });

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

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Header />

        <main style={{ padding: '32px', flex: 1, maxWidth: '1400px', width: '100%', margin: '0 auto' }}>
          {/* Calendar Top Controls */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '24px',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            {/* Date Navigator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={handlePrevDay}
                className="glass-card"
                style={{ padding: '8px 12px', display: 'flex', alignItems: 'center' }}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={handleToday}
                className="glass-card"
                style={{ padding: '8px 16px', fontSize: '0.88rem', fontWeight: 600 }}
              >
                Hoje
              </button>
              <button
                onClick={handleNextDay}
                className="glass-card"
                style={{ padding: '8px 12px', display: 'flex', alignItems: 'center' }}
              >
                <ChevronRight size={18} />
              </button>

              <h2 style={{ fontSize: '1.35rem', fontWeight: 700, marginLeft: '12px' }}>
                {selectedDate.toFormat("cccc, dd 'de' MMMM", { locale: 'pt-BR' })}
              </h2>
            </div>

            {/* Filters and CTA */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {/* Professional Filter */}
              <div style={{ position: 'relative' }}>
                <Select
                  value={selectedProfId}
                  onChange={(e) => setSelectedProfId(e.target.value)}
                  style={{ padding: '8px 14px', width: 'auto', minWidth: '180px' }}
                >
                  <option value="ALL">Todos os Profissionais</option>
                  {professionals.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>

              <button
                onClick={() => setIsNewModalOpen(true)}
                className="gold-gradient-primary gold-glow"
                style={{ padding: '10px 18px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={16} />
                <span>Novo Agendamento</span>
              </button>
            </div>
          </div>

          {/* Appointments Grid / List */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            {loading ? (
              <p style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '40px' }}>Carregando agenda...</p>
            ) : filteredAppointments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                <CalendarIcon size={44} color="var(--text-dim)" style={{ marginBottom: '16px' }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                  Nenhum agendamento para esta data
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '20px' }}>
                  Adicione um horário manualmente ou envie o link do seu WhatsApp para os clientes.
                </p>
                <button
                  onClick={() => setIsNewModalOpen(true)}
                  className="glass-card"
                  style={{ padding: '10px 20px', fontSize: '0.9rem', fontWeight: 600 }}
                >
                  + Agendar Horário Agora
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                {filteredAppointments.map((app) => {
                  const startTime = DateTime.fromISO(app.startAt, { zone: timezone }).toFormat('HH:mm');
                  const endTime = DateTime.fromISO(app.endAt, { zone: timezone }).toFormat('HH:mm');
                  const isCompleted = app.status === 'COMPLETED';
                  const isCanceled = app.status === 'CANCELED';

                  return (
                    <div
                      key={app.id}
                      className="glass-card"
                      onClick={() => {
                        setSelectedApp(app);
                        setIsStatusModalOpen(true);
                      }}
                      style={{
                        padding: '18px',
                        cursor: 'pointer',
                        borderLeft: `4px solid ${app.professional.color || 'var(--primary)'}`,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '12px',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <span
                            style={{
                              fontSize: '0.9rem',
                              fontWeight: 700,
                              color: 'var(--text-main)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            <Clock size={15} color="var(--primary)" />
                            {startTime} - {endTime}
                          </span>
                          <span
                            className={`badge ${
                              isCompleted ? 'badge-success' : isCanceled ? 'badge-danger' : 'badge-warning'
                            }`}
                          >
                            {isCompleted ? 'Concluído' : isCanceled ? 'Cancelado' : 'Agendado'}
                          </span>
                        </div>

                        <h4 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-main)' }}>
                          {app.customer.name}
                        </h4>
                        {app.customer.phone && (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', display: 'block' }}>
                            {app.customer.phone}
                          </span>
                        )}
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingTop: '10px',
                          borderTop: '1px solid var(--border-color)',
                          fontSize: '0.82rem',
                          color: 'var(--text-muted)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Scissors size={14} />
                          <span>{app.service.name}</span>
                        </div>
                        <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.95rem' }}>
                          {formatBRL(app.priceCents)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
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
              Nome do Cliente *
            </label>
            <input
              type="text"
              required
              placeholder="Nome completo"
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
            <TimePicker value={newTime} onChange={setNewTime} placeholder="14:00" />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Observações
            </label>
            <input
              type="text"
              placeholder="Ex: Cliente tem preferência por máquina 2"
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
            <div className="glass-card" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  {selectedApp.customer.name}
                </span>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--primary)' }}>
                  {formatBRL(selectedApp.priceCents)}
                </span>
              </div>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {selectedApp.service.name} • Profissional: {selectedApp.professional.name}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                Horário: {DateTime.fromISO(selectedApp.startAt, { zone: timezone }).toFormat('HH:mm')} às{' '}
                {DateTime.fromISO(selectedApp.endAt, { zone: timezone }).toFormat('HH:mm')}
              </span>
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
                    onClick={handleCancelAppointment}
                    className="glass-card"
                    style={{ padding: '12px 16px', color: '#FB7185', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <XCircle size={16} />
                    <span>Cancelar Horário</span>
                  </button>
                  <button
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
                  ✓ Atendimento concluído e lançado no fluxo de caixa
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
