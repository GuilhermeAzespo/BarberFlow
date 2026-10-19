'use client';

import React, { useEffect, useState } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Plus,
  Trash2,
  Calendar,
  CreditCard,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { Sidebar } from '../../components/Sidebar';
import { Header } from '../../components/Header';
import { Modal } from '../../components/Modal';
import { DateTime } from 'luxon';

interface FinanceReport {
  period: { startDate: string; endDate: string };
  summary: {
    totalIncomeCents: number;
    totalExpenseCents: number;
    netCents: number;
    profitMarginPercent: number;
    transactionCount: number;
  };
  byPaymentMethod: Record<string, number>;
  byCategory: Record<string, { income: number; expense: number }>;
}

interface Transaction {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  category: string;
  description?: string | null;
  amountCents: number;
  paymentMethod: string;
  occurredAt: string;
  appointment?: {
    service: { name: string };
    customer: { name: string };
  } | null;
}

export default function FinancePage() {
  const [report, setReport] = useState<FinanceReport | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<{ income: string[]; expense: string[] }>({ income: [], expense: [] });
  const [loading, setLoading] = useState(true);

  // Modal Nova Transação
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadFinance = async () => {
    setLoading(true);
    try {
      const [repRes, txRes, catRes] = await Promise.all([
        api.get<FinanceReport>('/api/finance/report'),
        api.get<{ transactions: Transaction[] }>('/api/finance/transactions?pageSize=30'),
        api.get<{ income: string[]; expense: string[] }>('/api/finance/categories'),
      ]);

      setReport(repRes);
      setTransactions(txRes.transactions);
      setCategories(catRes);
      if (catRes.expense.length) setCategory(catRes.expense[0]);
    } catch {
      // Ignora erro
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFinance();
  }, []);

  const openNewModal = (defaultType: 'INCOME' | 'EXPENSE') => {
    setType(defaultType);
    setCategory(defaultType === 'INCOME' ? categories.income[0] || 'Serviços' : categories.expense[0] || 'Produtos');
    setDescription('');
    setAmount('');
    setPaymentMethod('PIX');
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const amountCents = Math.round(parseFloat(amount.replace(',', '.')) * 100);
      if (isNaN(amountCents) || amountCents <= 0) {
        throw new Error('Informe um valor válido maior que zero.');
      }

      await api.post('/api/finance/transactions', {
        type,
        category,
        description: description || null,
        amountCents,
        paymentMethod,
      });

      setIsModalOpen(false);
      await loadFinance();
    } catch (err: unknown) {
      setErrorMsg(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Falha ao registrar.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir este lançamento?')) return;
    try {
      await api.delete(`/api/finance/transactions/${id}`);
      await loadFinance();
    } catch (err: unknown) {
      alert(err instanceof ApiError ? err.message : 'Falha ao excluir lançamento.');
    }
  };

  const formatBRL = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  };

  const paymentLabels: Record<string, string> = {
    PIX: 'Pix',
    CREDIT_CARD: 'Cartão de Crédito',
    DEBIT_CARD: 'Cartão de Débito',
    CASH: 'Dinheiro',
    TRANSFER: 'Transferência',
    OTHER: 'Outro',
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Header />

        <main style={{ padding: '32px', flex: 1, maxWidth: '1400px', width: '100%', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h1 style={{ fontSize: '1.85rem', fontWeight: 700, marginBottom: '4px' }}>Fluxo de Caixa</h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Monitore receitas, despesas, margem líquida e lançamentos automáticos de agendamentos.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => openNewModal('EXPENSE')}
                className="glass-card"
                style={{
                  padding: '10px 18px',
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: '#FB7185',
                  borderColor: 'rgba(244, 63, 94, 0.3)',
                }}
              >
                <TrendingDown size={16} />
                <span>+ Lançar Despesa</span>
              </button>
              <button
                onClick={() => openNewModal('INCOME')}
                className="gold-gradient-primary gold-glow"
                style={{ padding: '10px 18px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <TrendingUp size={16} />
                <span>+ Lançar Receita</span>
              </button>
            </div>
          </div>

          {/* Metrics Summary Row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '20px',
              marginBottom: '32px',
            }}
          >
            {/* Receitas */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>Receitas (Mês)</span>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#34D399',
                  }}
                >
                  <ArrowUpRight size={18} />
                </div>
              </div>
              <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#34D399', marginBottom: '4px' }}>
                {loading ? '...' : formatBRL(report?.summary.totalIncomeCents || 0)}
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Entradas consolidadas</span>
            </div>

            {/* Despesas */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>Despesas (Mês)</span>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'rgba(244, 63, 94, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#FB7185',
                  }}
                >
                  <ArrowDownRight size={18} />
                </div>
              </div>
              <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#FB7185', marginBottom: '4px' }}>
                {loading ? '...' : formatBRL(report?.summary.totalExpenseCents || 0)}
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Custos operacionais</span>
            </div>

            {/* Lucro Líquido */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>Lucro Líquido</span>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'rgba(229, 179, 56, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#E5B338',
                  }}
                >
                  <DollarSign size={18} />
                </div>
              </div>
              <div style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '4px' }}>
                {loading ? '...' : formatBRL(report?.summary.netCents || 0)}
              </div>
              <span style={{ fontSize: '0.78rem', color: '#FBBF24', fontWeight: 600 }}>
                Margem: {report?.summary.profitMarginPercent || 0}%
              </span>
            </div>
          </div>

          {/* Payment Methods Breakdown */}
          {report?.byPaymentMethod && (
            <div className="glass-panel" style={{ padding: '24px', marginBottom: '32px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '16px' }}>
                Receitas por Meio de Pagamento
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px' }}>
                {Object.entries(report.byPaymentMethod).map(([key, val]) => (
                  <div key={key} className="glass-card" style={{ padding: '14px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                      {paymentLabels[key] || key}
                    </span>
                    <strong style={{ fontSize: '1.1rem', color: 'var(--text-main)' }}>{formatBRL(val)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transactions History Table */}
          <div className="glass-panel" style={{ padding: '28px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '18px' }}>Histórico de Lançamentos</h3>

            {loading ? (
              <p style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '30px' }}>Carregando lançamentos...</p>
            ) : transactions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                <DollarSign size={40} color="var(--text-dim)" style={{ marginBottom: '12px' }} />
                <p>Nenhuma transação registrada no período.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Data</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Tipo</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Categoria</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Descrição</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Pagamento</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Valor</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => {
                      const isIncome = t.type === 'INCOME';
                      const dateFormatted = DateTime.fromISO(t.occurredAt).toFormat('dd/LL HH:mm');

                      return (
                        <tr
                          key={t.id}
                          style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}
                        >
                          <td style={{ padding: '14px 16px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                            {dateFormatted}
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            <span className={`badge ${isIncome ? 'badge-success' : 'badge-danger'}`}>
                              {isIncome ? 'Receita' : 'Despesa'}
                            </span>
                          </td>
                          <td style={{ padding: '14px 16px', fontWeight: 500 }}>{t.category}</td>
                          <td style={{ padding: '14px 16px', color: 'var(--text-muted)' }}>
                            {t.description || (t.appointment ? `${t.appointment.service.name} — ${t.appointment.customer.name}` : '—')}
                          </td>
                          <td style={{ padding: '14px 16px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                            {paymentLabels[t.paymentMethod] || t.paymentMethod}
                          </td>
                          <td
                            style={{
                              padding: '14px 16px',
                              textAlign: 'right',
                              fontWeight: 700,
                              color: isIncome ? '#34D399' : '#FB7185',
                            }}
                          >
                            {isIncome ? '+' : '-'} {formatBRL(t.amountCents)}
                          </td>
                          <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                            <button
                              onClick={() => handleDelete(t.id)}
                              style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Modal: Nova Transação */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={type === 'INCOME' ? 'Lançar Receita' : 'Lançar Despesa'}>
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

        <form onSubmit={handleSaveTransaction} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Valor em Reais (R$) *
            </label>
            <input
              type="text"
              required
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Categoria *
              </label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {(type === 'INCOME' ? categories.income : categories.expense).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Meio de Pagamento *
              </label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="PIX">Pix</option>
                <option value="CREDIT_CARD">Cartão de Crédito</option>
                <option value="DEBIT_CARD">Cartão de Débito</option>
                <option value="CASH">Dinheiro</option>
                <option value="TRANSFER">Transferência</option>
                <option value="OTHER">Outro</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Descrição / Motivo
            </label>
            <input
              type="text"
              placeholder="Ex: Compra de pomadas modeladoras"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
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
              {submitting ? 'Salvando...' : 'Confirmar Lançamento'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
