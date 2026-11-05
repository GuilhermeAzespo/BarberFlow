'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  ShieldCheck,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Send,
  Download,
  XCircle,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Scale,
  KeyRound,
  Building2,
  QrCode,
  CreditCard,
  Copy,
  Check,
  Scissors,
  Printer,
  Trash2,
} from 'lucide-react';
import { Sidebar } from '../../components/Sidebar';
import { Header } from '../../components/Header';
import { Modal } from '../../components/Modal';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';

const formatBRL = (cents: number) =>
  ((cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface FiscalConfigData {
  id: string;
  enabled: boolean;
  environment: 'HOMOLOGATION' | 'PRODUCTION';
  providerMode?: 'ADN_NACIONAL' | 'EXTERNAL_API';
  integrationMode?: 'NATIONAL_DIRECT' | 'WEBHOOK';
  cnpj: string | null;
  inscricaoMunicipal: string | null;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  codigoMunicipioIbge: string | null;
  uf: string | null;
  regimeTributario: 'MEI' | 'SIMPLES_NACIONAL' | 'LUCRO_PRESUMIDO' | number;
  optanteSimples?: number;
  optanteSimplesNacional?: boolean;
  aliquotaIss: number;
  codigoTributacaoNacional: string;
  codigoTributacaoMunicipal: string | null;
  itemListaServico: string;
  cnae: string | null;
  descricaoServicoPadrao?: string | null;
  serieDps: string;
  proximoNumeroDps: number;
  salaoParceiroEnabled: boolean;
  autoEmitOnComplete: boolean;
  autoSendWhatsApp?: boolean;
  autoSendWhatsapp?: boolean;
  externalApiUrl?: string | null;
  externalWebhookUrl?: string | null;
  externalApiToken?: string | null;
  hasCertificate: boolean;
  certSubject: string | null;
  certIssuer: string | null;
  certValidTo: string | null;
  certUploadedAt: string | null;
}

interface NfseInvoiceItem {
  id: string;
  appointmentId: string | null;
  numeroDps: number;
  serieDps: string;
  chaveAcesso: string | null;
  numeroNfse: string | null;
  codigoVerificacao: string | null;
  status: string;
  environment: 'HOMOLOGATION' | 'PRODUCTION';
  tomadorNome: string;
  tomadorDocumento: string | null;
  tomadorEmail: string | null;
  tomadorTelefone: string | null;
  discriminacao: string;
  valorBrutoCents?: number;
  valorServicosCents?: number;
  valorDeducaoParceiroCents?: number;
  valorDeducoesCents?: number;
  baseCalculoCents: number;
  aliquotaIss: number;
  valorIssCents: number;
  valorLiquidoCents: number;
  salaoParceiroAplicado?: boolean;
  profissionalParceiroNome?: string | null;
  profissionalNome?: string | null;
  cotaParteProfissionalCents?: number;
  urlDanfse?: string | null;
  danfseUrl?: string | null;
  errorMessage: string | null;
  whatsappSentAt: string | null;
  issuedAt?: string | null;
  emittedAt?: string | null;
  canceledAt?: string | null;
  cancelledAt?: string | null;
  createdAt?: string | null;
}

interface PendingAppointmentItem {
  id: string;
  startAt: string;
  completedAt: string | null;
  priceCents: number;
  customer: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    cpf?: string | null;
  };
  service: {
    id: string;
    name: string;
    priceCents: number;
  };
  professional: {
    id: string;
    name: string;
    commissionPercent?: number;
    commissionPct?: number;
  };
}

interface PixCheckoutResponse {
  paymentId: string;
  mpPaymentId: string;
  status: string;
  planName: string;
  amountCents: number;
  qrCode: string;
  qrCodeBase64?: string;
  expiresAt?: string;
}

const DEFAULT_STATS = {
  monthAuthorizedCount: 0,
  monthTotalValueCents: 0,
  monthTotalIssuedCents: 0,
  monthTotalIssCents: 0,
  monthTotalDeducoesCents: 0,
  monthSalaoParceiroDeducaoCents: 0,
  pendingAppointmentsCount: 0,
};

export default function NfsePage() {
  const { hasPlanFeature, refresh: refreshAuth, subscription } = useAuth();
  const hasNfseAccess = hasPlanFeature('nfse');

  const [activeTab, setActiveTab] = useState<'invoices' | 'pending' | 'config'>('invoices');
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [uploadingCert, setUploadingCert] = useState(false);
  const [emitting, setEmitting] = useState(false);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [config, setConfig] = useState<FiscalConfigData | null>(null);
  const [stats, setStats] = useState(DEFAULT_STATS);
  const [invoices, setInvoices] = useState<NfseInvoiceItem[]>([]);
  const [pendingAppointments, setPendingAppointments] = useState<PendingAppointmentItem[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [certFile, setCertFile] = useState<File | null>(null);
  const [certPassword, setCertPassword] = useState('');

  const [emitModalOpen, setEmitModalOpen] = useState(false);
  const [emitForm, setEmitForm] = useState({
    appointmentId: '' as string,
    tomadorNome: '',
    tomadorDocumento: '',
    tomadorEmail: '',
    tomadorTelefone: '',
    discriminacao: '',
    valorReais: '',
    aplicarSalaoParceiro: true,
    profissionalNome: '',
    cotaPartePct: 0,
    sendWhatsapp: true,
  });

  const [addonPriceCents, setAddonPriceCents] = useState(2990);
  const [checkoutMethod, setCheckoutMethod] = useState<'PIX' | 'CARD'>('PIX');
  const [addonCheckoutOpen, setAddonCheckoutOpen] = useState(false);
  const [addonLoading, setAddonLoading] = useState(false);
  const [pixData, setPixData] = useState<PixCheckoutResponse | null>(null);
  const [copiedPix, setCopiedPix] = useState(false);
  const [payerCpf, setPayerCpf] = useState('');
  const [cardForm, setCardForm] = useState({
    cardNumber: '',
    cardholderName: '',
    cardholderCpf: '',
    expMonth: '',
    expYear: '',
    cvv: '',
  });

  const showToast = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 6000);
  };

  const loadAllNfseData = useCallback(async () => {
    if (!hasNfseAccess) {
      try {
        const bill = await api.get<{ nfseAddon?: { priceCents: number } }>('/api/billing/status');
        if (bill?.nfseAddon?.priceCents) setAddonPriceCents(bill.nfseAddon.priceCents);
      } catch {
        // ignore
      }
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [overviewRes, invoicesRes, pendingRes] = await Promise.all([
        api.get<{
          config?: FiscalConfigData;
          stats?: Partial<typeof DEFAULT_STATS>;
          metrics?: Partial<typeof DEFAULT_STATS>;
          addonPriceCents?: number;
        }>('/api/nfse/overview'),
        api.get<{ invoices?: NfseInvoiceItem[] }>('/api/nfse/invoices?limit=100'),
        api.get<{ appointments?: PendingAppointmentItem[] }>('/api/nfse/pending-appointments'),
      ]);

      if (overviewRes?.config) {
        setConfig(overviewRes.config);
      }
      if (overviewRes?.addonPriceCents) {
        setAddonPriceCents(overviewRes.addonPriceCents);
      }

      const rawStats = overviewRes?.stats || overviewRes?.metrics || {};
      setStats({
        monthAuthorizedCount: rawStats.monthAuthorizedCount ?? 0,
        monthTotalValueCents: rawStats.monthTotalValueCents ?? rawStats.monthTotalIssuedCents ?? 0,
        monthTotalIssuedCents: rawStats.monthTotalIssuedCents ?? rawStats.monthTotalValueCents ?? 0,
        monthTotalIssCents: rawStats.monthTotalIssCents ?? 0,
        monthTotalDeducoesCents: rawStats.monthTotalDeducoesCents ?? rawStats.monthSalaoParceiroDeducaoCents ?? 0,
        monthSalaoParceiroDeducaoCents: rawStats.monthSalaoParceiroDeducaoCents ?? rawStats.monthTotalDeducoesCents ?? 0,
        pendingAppointmentsCount: rawStats.pendingAppointmentsCount ?? 0,
      });

      setInvoices(Array.isArray(invoicesRes?.invoices) ? invoicesRes.invoices : []);
      setPendingAppointments(Array.isArray(pendingRes?.appointments) ? pendingRes.appointments : []);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Erro ao carregar dados do módulo NFS-e.');
    } finally {
      setLoading(false);
    }
  }, [hasNfseAccess]);

  useEffect(() => {
    loadAllNfseData();
  }, [loadAllNfseData]);

  useEffect(() => {
    if (!pixData?.paymentId) return;
    const interval = setInterval(async () => {
      try {
        const res = await api.get<{ status: string; isPaid: boolean }>(`/api/billing/payments/${pixData.paymentId}/status`);
        if (res.isPaid || res.status === 'APPROVED') {
          clearInterval(interval);
          setAddonCheckoutOpen(false);
          setPixData(null);
          await refreshAuth();
          showToast('success', 'Módulo Emissor de NFS-e ativado com sucesso!');
        }
      } catch {
        // ignore
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [pixData, refreshAuth]);

  const handleOpenEmitFromAppointment = (appt: PendingAppointmentItem) => {
    const comm = appt.professional?.commissionPercent ?? appt.professional?.commissionPct ?? 0;
    setEmitForm({
      appointmentId: appt.id,
      tomadorNome: appt.customer?.name || 'Consumidor Final',
      tomadorDocumento: appt.customer?.cpf || '',
      tomadorEmail: appt.customer?.email || '',
      tomadorTelefone: appt.customer?.phone || '',
      discriminacao: `Prestação de serviços de barbearia: ${appt.service?.name || 'Serviço'} — Profissional: ${appt.professional?.name || ''}`,
      valorReais: ((appt.priceCents || 0) / 100).toFixed(2),
      aplicarSalaoParceiro: Boolean(config?.salaoParceiroEnabled),
      profissionalNome: appt.professional?.name || '',
      cotaPartePct: comm,
      sendWhatsapp: Boolean(config?.autoSendWhatsApp ?? config?.autoSendWhatsapp ?? true),
    });
    setEmitModalOpen(true);
  };

  const handleOpenManualEmit = () => {
    setEmitForm({
      appointmentId: '',
      tomadorNome: '',
      tomadorDocumento: '',
      tomadorEmail: '',
      tomadorTelefone: '',
      discriminacao: config?.descricaoServicoPadrao || 'Prestação de serviços de barbearia e cuidados pessoais.',
      valorReais: '50.00',
      aplicarSalaoParceiro: false,
      profissionalNome: '',
      cotaPartePct: 0,
      sendWhatsapp: true,
    });
    setEmitModalOpen(true);
  };

  const handleEmitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const valorCents = Math.round(parseFloat(emitForm.valorReais.replace(',', '.')) * 100);
    if (!valorCents || valorCents < 100) {
      showToast('error', 'Informe um valor válido para a nota fiscal (mínimo R$ 1,00).');
      return;
    }

    setEmitting(true);
    try {
      const res = await api.post<{
        success: boolean;
        message: string;
        invoice: NfseInvoiceItem;
      }>('/api/nfse/emit', {
        appointmentId: emitForm.appointmentId || undefined,
        tomadorNome: emitForm.tomadorNome,
        tomadorDocumento: emitForm.tomadorDocumento || null,
        tomadorEmail: emitForm.tomadorEmail || null,
        tomadorTelefone: emitForm.tomadorTelefone || null,
        discriminacao: emitForm.discriminacao,
        valorBrutoCents: valorCents,
        valorServicosCents: valorCents,
        aplicarSalaoParceiro: emitForm.aplicarSalaoParceiro,
        sendWhatsApp: emitForm.sendWhatsapp,
      });

      setEmitModalOpen(false);
      showToast(res.success ? 'success' : 'error', res.message);
      await loadAllNfseData();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Falha ao emitir NFS-e.');
    } finally {
      setEmitting(false);
    }
  };

  const handleSendWhatsapp = async (invoiceId: string) => {
    try {
      const res = await api.post<{
        success: boolean;
        sentViaBot?: boolean;
        whatsappUrl?: string;
        message: string;
      }>(`/api/nfse/invoices/${invoiceId}/whatsapp`, {});

      if (res.sentViaBot) {
        showToast('success', res.message);
      } else if (res.whatsappUrl) {
        window.open(res.whatsappUrl, '_blank', 'noopener,noreferrer');
        showToast('success', 'Abrindo WhatsApp com o link da DANFSE...');
      } else {
        showToast('success', res.message || 'Nota Fiscal enviada!');
      }
      await loadAllNfseData();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Falha ao enviar NFS-e via WhatsApp.');
    }
  };

  const handleCancelInvoice = async (invoice: NfseInvoiceItem) => {
    const motivo = window.prompt(
      `Deseja cancelar a NFS-e Nº ${invoice.numeroNfse || invoice.numeroDps} (${invoice.tomadorNome})?\nInforme o motivo do cancelamento:`,
      'Erro no preenchimento de dados da nota fiscal',
    );
    if (!motivo) return;

    try {
      const res = await api.post<{ message: string }>(`/api/nfse/invoices/${invoice.id}/cancel`, {
        reason: motivo,
        motivo,
      });
      showToast('success', res.message);
      await loadAllNfseData();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Erro ao cancelar NFS-e.');
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setSavingConfig(true);
    try {
      const res = await api.put<{ message: string }>('/api/nfse/config', {
        enabled: config.enabled,
        environment: config.environment,
        cnpj: config.cnpj,
        inscricaoMunicipal: config.inscricaoMunicipal,
        razaoSocial: config.razaoSocial,
        nomeFantasia: config.nomeFantasia,
        codigoMunicipioIbge: config.codigoMunicipioIbge,
        uf: config.uf,
        regimeTributario: config.regimeTributario,
        aliquotaIss: Number(config.aliquotaIss),
        codigoTributacaoNacional: config.codigoTributacaoNacional,
        codigoTributacaoMunicipal: config.codigoTributacaoMunicipal,
        itemListaServico: config.itemListaServico,
        cnae: config.cnae,
        serieDps: config.serieDps,
        proximoNumeroDps: Number(config.proximoNumeroDps),
        salaoParceiroEnabled: config.salaoParceiroEnabled,
        autoEmitOnComplete: config.autoEmitOnComplete,
        autoSendWhatsApp: Boolean(config.autoSendWhatsApp ?? config.autoSendWhatsapp ?? true),
      });
      showToast('success', res.message || 'Configurações fiscais salvas com sucesso!');
      await loadAllNfseData();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Erro ao salvar configurações fiscais.');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleUploadCertificate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!certFile || !certPassword) {
      showToast('error', 'Selecione o arquivo .pfx/.p12 e digite a senha do Certificado Digital A1.');
      return;
    }

    setUploadingCert(true);
    try {
      const formData = new FormData();
      formData.append('certificate', certFile);
      formData.append('password', certPassword);

      const res = await api.post<{
        success: boolean;
        message: string;
      }>('/api/nfse/certificate', formData);

      showToast('success', res.message);
      setCertFile(null);
      setCertPassword('');
      await loadAllNfseData();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Falha ao validar Certificado Digital A1.');
    } finally {
      setUploadingCert(false);
    }
  };

  const handleRemoveCertificate = async () => {
    if (!window.confirm('Deseja realmente remover o Certificado Digital A1 vinculado a este salão?')) return;
    try {
      await api.delete('/api/nfse/certificate');
      showToast('success', 'Certificado Digital removido com sucesso.');
      await loadAllNfseData();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Falha ao remover certificado.');
    }
  };

  const handleGenerateAddonPix = async () => {
    setAddonLoading(true);
    try {
      const res = await api.post<PixCheckoutResponse>('/api/billing/addon/nfse/pix', {
        payerCpf: payerCpf || undefined,
      });
      setPixData(res);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Erro ao gerar PIX do módulo NFS-e.');
    } finally {
      setAddonLoading(false);
    }
  };

  const handlePayAddonCard = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddonLoading(true);
    try {
      const res = await api.post<{ success: boolean; message: string }>('/api/billing/addon/nfse/card', {
        ...cardForm,
        installments: 1,
      });
      if (res.success) {
        setAddonCheckoutOpen(false);
        await refreshAuth();
        showToast('success', res.message);
      } else {
        showToast('error', res.message);
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Erro ao processar cartão.');
    } finally {
      setAddonLoading(false);
    }
  };

  const filteredInvoices = (Array.isArray(invoices) ? invoices : []).filter((inv) => {
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'CANCELLED' && inv.status !== 'CANCELED' && inv.status !== 'CANCELLED') return false;
      if (statusFilter === 'ERROR' && inv.status !== 'REJECTED' && inv.status !== 'ERROR') return false;
      if (statusFilter === 'AUTHORIZED' && inv.status !== 'AUTHORIZED') return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (inv.tomadorNome || '').toLowerCase().includes(q) ||
      (inv.tomadorDocumento && inv.tomadorDocumento.toLowerCase().includes(q)) ||
      (inv.numeroNfse && inv.numeroNfse.toLowerCase().includes(q)) ||
      String(inv.numeroDps || '').includes(q)
    );
  });

  const safeStats = stats || DEFAULT_STATS;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-app)' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Header />

        <main style={{ flex: 1, padding: '24px 32px', maxWidth: '1400px', width: '100%', margin: '0 auto' }}>
          <div style={{ marginBottom: '22px' }}>
            <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#F9FAFB', margin: '0 0 4px 0' }}>
              Notas Fiscais de Serviço (NFS-e)
            </h1>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: 0 }}>
              Emissor Fiscal Padrão Nacional integrado com Certificado Digital A1, Lei do Salão-Parceiro e envio via WhatsApp
            </p>
          </div>

          {feedback && (
            <div
              style={{
                marginBottom: '20px',
                padding: '14px 18px',
                borderRadius: '12px',
                background: feedback.type === 'success' ? 'rgba(16, 185, 129, 0.14)' : 'rgba(244, 63, 94, 0.14)',
                border: `1px solid ${feedback.type === 'success' ? 'rgba(16, 185, 129, 0.35)' : 'rgba(244, 63, 94, 0.35)'}`,
                color: feedback.type === 'success' ? '#34D399' : '#FB7185',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontWeight: 600,
                fontSize: '0.9rem',
              }}
            >
              {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
              <span>{feedback.message}</span>
            </div>
          )}

          {!hasNfseAccess ? (
            <div
              className="glass-panel"
              style={{
                padding: '36px',
                borderRadius: '20px',
                border: '1px solid rgba(229, 179, 56, 0.28)',
                background: 'linear-gradient(145deg, rgba(17, 24, 39, 0.95), rgba(11, 15, 23, 0.98))',
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ flex: '1 1 540px' }}>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 14px',
                      borderRadius: '999px',
                      background: 'rgba(16, 185, 129, 0.14)',
                      border: '1px solid rgba(16, 185, 129, 0.35)',
                      color: '#34D399',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      marginBottom: '16px',
                    }}
                  >
                    <Sparkles size={14} /> MÓDULO FISCAL INTEGRADO • CUSTO ZERO POR NOTA
                  </div>

                  <h2 style={{ fontSize: '1.85rem', fontWeight: 800, color: '#F9FAFB', margin: '0 0 12px 0', lineHeight: 1.2 }}>
                    Emita Notas Fiscais (NFS-e) em 1 clique direto da sua agenda
                  </h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.96rem', lineHeight: 1.6, marginBottom: '24px' }}>
                    Conecte o <strong>Certificado Digital e-CNPJ A1 (.pfx)</strong> da sua barbearia e transmita Notas Fiscais de Serviços Eletrônicas diretamente para o <strong>Portal Nacional da NFS-e (Sefin Nacional)</strong> sem pagar taxas por nota emitida.
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '14px', marginBottom: '28px' }}>
                    {[
                      {
                        icon: Scale,
                        title: 'Lei do Salão-Parceiro (13.352/16)',
                        desc: 'Abate automaticamente a comissão do barbeiro parceiro da base de cálculo do ISS.',
                      },
                      {
                        icon: KeyRound,
                        title: 'Certificado Digital A1 (.pfx)',
                        desc: 'Transmissão mTLS direta para a Sefin Nacional sem intermediários pagos.',
                      },
                      {
                        icon: Send,
                        title: 'DANFSE no WhatsApp do Cliente',
                        desc: 'Envio automático do link oficial da nota fiscal assim que o corte é concluído.',
                      },
                      {
                        icon: CheckCircle2,
                        title: 'Homologação & Produção',
                        desc: 'Teste suas emissões sem valor fiscal antes de ativar em Produção na Prefeitura.',
                      },
                    ].map((feat, i) => {
                      const Icon = feat.icon;
                      return (
                        <div
                          key={i}
                          style={{
                            padding: '14px 16px',
                            borderRadius: '12px',
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid rgba(255, 255, 255, 0.07)',
                            display: 'flex',
                            gap: '12px',
                            alignItems: 'flex-start',
                          }}
                        >
                          <div
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '10px',
                              background: 'rgba(229, 179, 56, 0.14)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#E5B338',
                              flexShrink: 0,
                            }}
                          >
                            <Icon size={18} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#F9FAFB', marginBottom: '3px' }}>{feat.title}</div>
                            <div style={{ fontSize: '0.79rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{feat.desc}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div
                  style={{
                    flex: '1 1 340px',
                    maxWidth: '400px',
                    padding: '28px',
                    borderRadius: '18px',
                    background: 'rgba(15, 23, 42, 0.9)',
                    border: '1px solid rgba(229, 179, 56, 0.35)',
                    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
                  }}
                >
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: '#E5B338', letterSpacing: '0.06em' }}>
                    Contratação Avulsa (Add-on)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', margin: '10px 0 6px 0' }}>
                    <span style={{ fontSize: '2.2rem', fontWeight: 900, color: '#F9FAFB' }}>{formatBRL(addonPriceCents)}</span>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>/mês</span>
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                    Adicione o Emissor de NFS-e ao seu plano atual ({subscription?.plan?.name || 'Starter/Pro'}) com notas fiscais ilimitadas.
                  </p>

                  <button
                    onClick={() => {
                      setPixData(null);
                      setAddonCheckoutOpen(true);
                    }}
                    className="btn-primary"
                    style={{
                      width: '100%',
                      padding: '13px 18px',
                      borderRadius: '12px',
                      fontWeight: 800,
                      fontSize: '0.92rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      marginBottom: '12px',
                    }}
                  >
                    <Sparkles size={17} /> Ativar Módulo NFS-e Agora
                  </button>

                  <a
                    href="/billing"
                    style={{
                      display: 'block',
                      textAlign: 'center',
                      padding: '11px 16px',
                      borderRadius: '12px',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      color: '#E5E7EB',
                      fontSize: '0.83rem',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    Ou faça upgrade para o <strong>Plano Premium</strong> (Já Incluso) →
                  </a>
                </div>
              </div>
            </div>
          ) : loading ? (
            <div className="glass-panel" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Carregando central fiscal NFS-e...
            </div>
          ) : (
            <>
              <div
                className="glass-panel"
                style={{
                  padding: '16px 22px',
                  borderRadius: '14px',
                  marginBottom: '22px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  border: config?.hasCertificate
                    ? '1px solid rgba(16, 185, 129, 0.3)'
                    : '1px solid rgba(245, 158, 11, 0.35)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                  <div
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontWeight: 800,
                      fontSize: '0.75rem',
                      background:
                        config?.environment === 'PRODUCTION'
                          ? 'rgba(16, 185, 129, 0.15)'
                          : 'rgba(245, 158, 11, 0.15)',
                      color: config?.environment === 'PRODUCTION' ? '#34D399' : '#FBBF24',
                      border:
                        config?.environment === 'PRODUCTION'
                          ? '1px solid rgba(16, 185, 129, 0.35)'
                          : '1px solid rgba(245, 158, 11, 0.35)',
                    }}
                  >
                    {config?.environment === 'PRODUCTION' ? 'AMBIENTE DE PRODUÇÃO (SEFIN NACIONAL)' : 'AMBIENTE DE HOMOLOGAÇÃO (TESTES)'}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.86rem', color: 'var(--text-main)' }}>
                    <KeyRound size={16} color={config?.hasCertificate ? '#10B981' : '#F59E0B'} />
                    {config?.hasCertificate ? (
                      <span>
                        Certificado A1 Ativo: <strong>{config.certSubject}</strong>
                      </span>
                    ) : (
                      <span style={{ color: '#FBBF24' }}>
                        Certificado Digital A1 (.pfx) ainda não enviado — modo simulação ativo
                      </span>
                    )}
                  </div>

                  {config?.salaoParceiroEnabled && (
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: '999px',
                        background: 'rgba(229, 179, 56, 0.12)',
                        color: '#E5B338',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                      }}
                    >
                      ⚖️ Lei do Salão-Parceiro Ativa
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={handleOpenManualEmit}
                    className="btn-primary"
                    style={{
                      padding: '9px 16px',
                      borderRadius: '10px',
                      fontWeight: 700,
                      fontSize: '0.84rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Plus size={16} /> Emitir Nova NFS-e
                  </button>
                  <button
                    onClick={() => setActiveTab('config')}
                    style={{
                      padding: '9px 14px',
                      borderRadius: '10px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'var(--text-main)',
                      fontWeight: 600,
                      fontSize: '0.84rem',
                      cursor: 'pointer',
                    }}
                  >
                    Configurar Certificado & CNPJ
                  </button>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                  gap: '16px',
                  marginBottom: '24px',
                }}
              >
                <div className="glass-panel" style={{ padding: '20px', borderRadius: '14px' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '6px' }}>Notas Emitidas no Mês</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#F9FAFB' }}>{safeStats.monthAuthorizedCount}</div>
                  <div style={{ fontSize: '0.76rem', color: '#34D399', marginTop: '4px' }}>
                    ISS Apurado: {formatBRL(safeStats.monthTotalIssCents)}
                  </div>
                </div>

                <div className="glass-panel" style={{ padding: '20px', borderRadius: '14px' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '6px' }}>Total Faturado em NFS-e (Mês)</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#E5B338' }}>
                    {formatBRL(safeStats.monthTotalValueCents || safeStats.monthTotalIssuedCents)}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Série {config?.serieDps || '1'} • Próx. DPS #{config?.proximoNumeroDps || 1}
                  </div>
                </div>

                <div className="glass-panel" style={{ padding: '20px', borderRadius: '14px' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '6px' }}>Dedução Salão-Parceiro (Mês)</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#34D399' }}>
                    {formatBRL(safeStats.monthTotalDeducoesCents || safeStats.monthSalaoParceiroDeducaoCents)}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Cota-parte abatida da base de ISS (Lei 13.352/16)
                  </div>
                </div>

                <div
                  className="glass-panel"
                  onClick={() => setActiveTab('pending')}
                  style={{ padding: '20px', borderRadius: '14px', cursor: 'pointer' }}
                >
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '6px' }}>Cortes Concluídos sem Nota</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#FBBF24' }}>
                    {pendingAppointments.length}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#E5B338', marginTop: '4px' }}>
                    Clique para emitir em 1 clique →
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: '10px',
                  marginBottom: '20px',
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                  paddingBottom: '12px',
                  flexWrap: 'wrap',
                }}
              >
                {[
                  { id: 'invoices', label: `Notas Fiscais Emitidas (${invoices.length})`, icon: FileText },
                  { id: 'pending', label: `Atendimentos Pendentes de Nota (${pendingAppointments.length})`, icon: Scissors },
                  { id: 'config', label: 'Configuração Fiscal & Certificado A1 (.pfx)', icon: ShieldCheck },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as typeof activeTab)}
                      style={{
                        padding: '10px 18px',
                        borderRadius: '10px',
                        border: active ? '1px solid #E5B338' : '1px solid rgba(255,255,255,0.08)',
                        background: active ? 'rgba(229, 179, 56, 0.15)' : 'rgba(255,255,255,0.03)',
                        color: active ? '#E5B338' : 'var(--text-muted)',
                        fontWeight: active ? 700 : 500,
                        fontSize: '0.86rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                      }}
                    >
                      <Icon size={16} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {activeTab === 'invoices' && (
                <div className="glass-panel" style={{ padding: '22px', borderRadius: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '18px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: '10px', flex: '1 1 320px' }}>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <Search
                          size={16}
                          style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }}
                        />
                        <input
                          type="text"
                          placeholder="Buscar por cliente, CPF/CNPJ ou número da NFS-e..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="input-field"
                          style={{ paddingLeft: '36px', width: '100%' }}
                        />
                      </div>
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="input-field"
                        style={{ width: '170px' }}
                      >
                        <option value="ALL">Todos os Status</option>
                        <option value="AUTHORIZED">Autorizadas</option>
                        <option value="CANCELLED">Canceladas</option>
                        <option value="ERROR">Com Erro / Rejeitadas</option>
                      </select>
                    </div>

                    <button
                      onClick={loadAllNfseData}
                      style={{
                        padding: '8px 14px',
                        borderRadius: '10px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'var(--text-main)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                        fontSize: '0.83rem',
                      }}
                    >
                      <RefreshCw size={15} /> Atualizar
                    </button>
                  </div>

                  {filteredInvoices.length === 0 ? (
                    <div style={{ padding: '44px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <FileText size={36} style={{ opacity: 0.35, marginBottom: '10px' }} />
                      <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                        Nenhuma Nota Fiscal encontrada
                      </div>
                      <div style={{ fontSize: '0.84rem' }}>
                        Clique em &ldquo;Emitir Nova NFS-e&rdquo; ou selecione um atendimento concluído na aba ao lado.
                      </div>
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)', textAlign: 'left' }}>
                            <th style={{ padding: '12px 10px' }}>Nº NFS-e / DPS</th>
                            <th style={{ padding: '12px 10px' }}>Data</th>
                            <th style={{ padding: '12px 10px' }}>Tomador (Cliente)</th>
                            <th style={{ padding: '12px 10px' }}>Valor Bruto</th>
                            <th style={{ padding: '12px 10px' }}>Salão-Parceiro</th>
                            <th style={{ padding: '12px 10px' }}>Base / ISS</th>
                            <th style={{ padding: '12px 10px' }}>Status</th>
                            <th style={{ padding: '12px 10px', textAlign: 'right' }}>Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredInvoices.map((inv) => {
                            const valorBruto = inv.valorBrutoCents ?? inv.valorServicosCents ?? 0;
                            const valorDeducao = inv.valorDeducaoParceiroCents ?? inv.valorDeducoesCents ?? 0;
                            const profNome = inv.profissionalParceiroNome || inv.profissionalNome;
                            const dateStr = inv.issuedAt || inv.emittedAt || inv.createdAt;
                            const isCanceled = inv.status === 'CANCELED' || inv.status === 'CANCELLED';

                            return (
                              <tr key={inv.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '12px 10px', fontWeight: 700, color: '#F9FAFB' }}>
                                  <div>{inv.numeroNfse || `DPS #${inv.numeroDps}`}</div>
                                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontWeight: 500 }}>
                                    {inv.environment === 'PRODUCTION' ? 'Produção' : 'Homologação'}
                                  </div>
                                </td>
                                <td style={{ padding: '12px 10px', color: 'var(--text-muted)' }}>
                                  {dateStr
                                    ? new Date(dateStr).toLocaleString('pt-BR', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: '2-digit',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })
                                    : '—'}
                                </td>
                                <td style={{ padding: '12px 10px' }}>
                                  <div style={{ fontWeight: 600, color: '#F9FAFB' }}>{inv.tomadorNome}</div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {inv.tomadorDocumento || 'CPF não informado'}
                                  </div>
                                </td>
                                <td style={{ padding: '12px 10px', fontWeight: 700, color: '#F9FAFB' }}>
                                  {formatBRL(valorBruto)}
                                </td>
                                <td style={{ padding: '12px 10px' }}>
                                  {valorDeducao > 0 ? (
                                    <div>
                                      <span style={{ color: '#34D399', fontWeight: 700 }}>
                                        -{formatBRL(valorDeducao)}
                                      </span>
                                      {profNome && (
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{profNome}</div>
                                      )}
                                    </div>
                                  ) : (
                                    <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>—</span>
                                  )}
                                </td>
                                <td style={{ padding: '12px 10px' }}>
                                  <div style={{ color: '#E5B338', fontWeight: 700 }}>{formatBRL(inv.baseCalculoCents)}</div>
                                  <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                                    ISS ({inv.aliquotaIss}%): {formatBRL(inv.valorIssCents)}
                                  </div>
                                </td>
                                <td style={{ padding: '12px 10px' }}>
                                  <span
                                    style={{
                                      padding: '4px 9px',
                                      borderRadius: '999px',
                                      fontSize: '0.72rem',
                                      fontWeight: 800,
                                      background:
                                        inv.status === 'AUTHORIZED'
                                          ? 'rgba(16, 185, 129, 0.14)'
                                          : isCanceled
                                          ? 'rgba(244, 63, 94, 0.14)'
                                          : 'rgba(245, 158, 11, 0.14)',
                                      color:
                                        inv.status === 'AUTHORIZED'
                                          ? '#34D399'
                                          : isCanceled
                                          ? '#FB7185'
                                          : '#FBBF24',
                                    }}
                                  >
                                    {inv.status === 'AUTHORIZED'
                                      ? 'AUTORIZADA'
                                      : isCanceled
                                      ? 'CANCELADA'
                                      : inv.status}
                                  </span>
                                  {inv.errorMessage && (
                                    <div style={{ fontSize: '0.7rem', color: '#FB7185', marginTop: '4px', maxWidth: '200px' }}>
                                      {inv.errorMessage}
                                    </div>
                                  )}
                                </td>
                                <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                                  <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                                    <a
                                      href={`/api/public/nfse/${inv.id}/danfse`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title="Abrir / Imprimir DANFSE Oficial"
                                      style={{
                                        padding: '6px 10px',
                                        borderRadius: '8px',
                                        background: 'rgba(229, 179, 56, 0.14)',
                                        color: '#E5B338',
                                        textDecoration: 'none',
                                        fontSize: '0.76rem',
                                        fontWeight: 700,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                      }}
                                    >
                                      <Printer size={14} /> DANFSE
                                    </a>

                                    <button
                                      onClick={() => handleSendWhatsapp(inv.id)}
                                      title="Enviar DANFSE no WhatsApp do cliente"
                                      style={{
                                        padding: '6px 10px',
                                        borderRadius: '8px',
                                        background: 'rgba(16, 185, 129, 0.14)',
                                        border: 'none',
                                        color: '#34D399',
                                        fontSize: '0.76rem',
                                        fontWeight: 700,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      <Send size={13} /> WhatsApp
                                    </button>

                                    <a
                                      href={`/api/nfse/invoices/${inv.id}/xml`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title="Baixar XML Padrão Nacional"
                                      style={{
                                        padding: '6px 8px',
                                        borderRadius: '8px',
                                        background: 'rgba(255,255,255,0.06)',
                                        color: 'var(--text-main)',
                                        textDecoration: 'none',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                      }}
                                    >
                                      <Download size={14} />
                                    </a>

                                    {inv.status === 'AUTHORIZED' && (
                                      <button
                                        onClick={() => handleCancelInvoice(inv)}
                                        title="Cancelar NFS-e"
                                        style={{
                                          padding: '6px 8px',
                                          borderRadius: '8px',
                                          background: 'rgba(244, 63, 94, 0.12)',
                                          border: 'none',
                                          color: '#FB7185',
                                          cursor: 'pointer',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                        }}
                                      >
                                        <XCircle size={14} />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'pending' && (
                <div className="glass-panel" style={{ padding: '22px', borderRadius: '16px' }}>
                  <div style={{ marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#F9FAFB' }}>
                      Atendimentos Concluídos Prontos para Emissão Fiscal
                    </h3>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.83rem', color: 'var(--text-muted)' }}>
                      Emita a NFS-e de qualquer atendimento finalizado com cálculo automático da cota-parte do profissional.
                    </p>
                  </div>

                  {pendingAppointments.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Todos os atendimentos concluídos recentes já possuem nota fiscal emitida!
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)', textAlign: 'left' }}>
                            <th style={{ padding: '12px 10px' }}>Concluído em</th>
                            <th style={{ padding: '12px 10px' }}>Cliente</th>
                            <th style={{ padding: '12px 10px' }}>Serviço</th>
                            <th style={{ padding: '12px 10px' }}>Profissional (Comissão)</th>
                            <th style={{ padding: '12px 10px' }}>Valor</th>
                            <th style={{ padding: '12px 10px', textAlign: 'right' }}>Ação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pendingAppointments.map((appt) => {
                            const comm = appt.professional?.commissionPercent ?? appt.professional?.commissionPct ?? 0;
                            return (
                              <tr key={appt.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '12px 10px', color: 'var(--text-muted)' }}>
                                  {new Date(appt.completedAt || appt.startAt).toLocaleString('pt-BR', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </td>
                                <td style={{ padding: '12px 10px' }}>
                                  <div style={{ fontWeight: 600, color: '#F9FAFB' }}>{appt.customer?.name}</div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {appt.customer?.cpf ? `CPF: ${appt.customer.cpf}` : appt.customer?.phone || 'Sem telefone'}
                                  </div>
                                </td>
                                <td style={{ padding: '12px 10px', color: '#E5E7EB' }}>{appt.service?.name}</td>
                                <td style={{ padding: '12px 10px', color: 'var(--text-muted)' }}>
                                  {appt.professional?.name} ({comm}%)
                                </td>
                                <td style={{ padding: '12px 10px', fontWeight: 700, color: '#E5B338' }}>
                                  {formatBRL(appt.priceCents)}
                                </td>
                                <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                                  <button
                                    onClick={() => handleOpenEmitFromAppointment(appt)}
                                    className="btn-primary"
                                    style={{
                                      padding: '7px 14px',
                                      borderRadius: '8px',
                                      fontSize: '0.78rem',
                                      fontWeight: 700,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                    }}
                                  >
                                    <FileText size={14} /> Emitir NFS-e
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
              )}

              {activeTab === 'config' && config && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '22px' }}>
                  <div className="glass-panel" style={{ padding: '24px', borderRadius: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                      <KeyRound size={20} color="#E5B338" />
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#F9FAFB' }}>
                        Certificado Digital e-CNPJ A1 (.pfx / .p12)
                      </h3>
                    </div>

                    <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '18px' }}>
                      Para transmitir notas diretamente para o Portal Nacional da NFS-e (Sefin Nacional) com custo zero, envie o arquivo <strong>.pfx</strong> do Certificado Digital ICP-Brasil A1 do salão.
                    </p>

                    {config.hasCertificate ? (
                      <div
                        style={{
                          padding: '16px',
                          borderRadius: '12px',
                          background: 'rgba(16, 185, 129, 0.1)',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          marginBottom: '18px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                          <div>
                            <div style={{ fontWeight: 700, color: '#34D399', fontSize: '0.88rem', marginBottom: '4px' }}>
                              ✓ Certificado Digital A1 Vinculado & Validado
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#E5E7EB' }}>
                              <strong>Titular:</strong> {config.certSubject}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                              <strong>Emissor:</strong> {config.certIssuer}
                            </div>
                            {config.certValidTo && (
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                <strong>Válido até:</strong> {new Date(config.certValidTo).toLocaleDateString('pt-BR')}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={handleRemoveCertificate}
                            style={{
                              padding: '6px 10px',
                              borderRadius: '8px',
                              background: 'rgba(244, 63, 94, 0.15)',
                              border: '1px solid rgba(244, 63, 94, 0.3)',
                              color: '#FB7185',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <Trash2 size={13} /> Remover
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <form onSubmit={handleUploadCertificate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-muted)' }}>
                          Arquivo do Certificado (.pfx ou .p12)
                        </label>
                        <input
                          type="file"
                          accept=".pfx,.p12"
                          onChange={(e) => setCertFile(e.target.files?.[0] || null)}
                          className="input-field"
                          style={{ width: '100%' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-muted)' }}>
                          Senha do Certificado Digital
                        </label>
                        <input
                          type="password"
                          placeholder="Digite a senha do arquivo .pfx"
                          value={certPassword}
                          onChange={(e) => setCertPassword(e.target.value)}
                          className="input-field"
                          style={{ width: '100%' }}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={uploadingCert}
                        className="btn-primary"
                        style={{
                          padding: '11px 16px',
                          borderRadius: '10px',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                        }}
                      >
                        <Upload size={16} />
                        {uploadingCert ? 'Validando Certificado ICP-Brasil...' : 'Validar e Salvar Certificado A1'}
                      </button>
                    </form>
                  </div>

                  <form onSubmit={handleSaveConfig} className="glass-panel" style={{ padding: '24px', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                      <Building2 size={20} color="#E5B338" />
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#F9FAFB' }}>
                        Dados Fiscais, Tributação & Automação
                      </h3>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          Ambiente de Emissão
                        </label>
                        <select
                          value={config.environment}
                          onChange={(e) => setConfig({ ...config, environment: e.target.value as 'HOMOLOGATION' | 'PRODUCTION' })}
                          className="input-field"
                          style={{ width: '100%' }}
                        >
                          <option value="HOMOLOGATION">Homologação (Testes)</option>
                          <option value="PRODUCTION">Produção (Validade Jurídica)</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          Regime Tributário
                        </label>
                        <select
                          value={String(config.regimeTributario || 'MEI')}
                          onChange={(e) => setConfig({ ...config, regimeTributario: e.target.value as FiscalConfigData['regimeTributario'] })}
                          className="input-field"
                          style={{ width: '100%' }}
                        >
                          <option value="MEI">MEI (Microempreendedor Individual)</option>
                          <option value="SIMPLES_NACIONAL">Simples Nacional (ME / EPP)</option>
                          <option value="LUCRO_PRESUMIDO">Lucro Presumido / Normal</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          CNPJ da Barbearia / Salão
                        </label>
                        <input
                          type="text"
                          placeholder="00.000.000/0001-00"
                          value={config.cnpj || ''}
                          onChange={(e) => setConfig({ ...config, cnpj: e.target.value })}
                          className="input-field"
                          style={{ width: '100%' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          Inscrição Municipal (CMC)
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: 123456-7"
                          value={config.inscricaoMunicipal || ''}
                          onChange={(e) => setConfig({ ...config, inscricaoMunicipal: e.target.value })}
                          className="input-field"
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          Razão Social do Emitente
                        </label>
                        <input
                          type="text"
                          value={config.razaoSocial || ''}
                          onChange={(e) => setConfig({ ...config, razaoSocial: e.target.value })}
                          className="input-field"
                          style={{ width: '100%' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          Código IBGE do Município (7 dígitos)
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: 3550308 (São Paulo)"
                          value={config.codigoMunicipioIbge || ''}
                          onChange={(e) => setConfig({ ...config, codigoMunicipioIbge: e.target.value })}
                          className="input-field"
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          Alíquota ISS (%)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={config.aliquotaIss}
                          onChange={(e) => setConfig({ ...config, aliquotaIss: parseFloat(e.target.value) || 0 })}
                          className="input-field"
                          style={{ width: '100%' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          Cód. Trib. Nacional
                        </label>
                        <input
                          type="text"
                          value={config.codigoTributacaoNacional}
                          onChange={(e) => setConfig({ ...config, codigoTributacaoNacional: e.target.value })}
                          className="input-field"
                          style={{ width: '100%' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          Item LC 116/03
                        </label>
                        <input
                          type="text"
                          value={config.itemListaServico}
                          onChange={(e) => setConfig({ ...config, itemListaServico: e.target.value })}
                          className="input-field"
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>

                    <div
                      style={{
                        padding: '14px',
                        borderRadius: '12px',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                      }}
                    >
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.84rem' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(config.salaoParceiroEnabled)}
                          onChange={(e) => setConfig({ ...config, salaoParceiroEnabled: e.target.checked })}
                        />
                        <span>
                          <strong>Ativar Lei do Salão-Parceiro (Lei nº 13.352/2016)</strong> — Deduz a comissão do barbeiro da base de cálculo do ISS
                        </span>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.84rem' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(config.autoEmitOnComplete)}
                          onChange={(e) => setConfig({ ...config, autoEmitOnComplete: e.target.checked })}
                        />
                        <span>
                          <strong>Emitir NFS-e automaticamente</strong> assim que o agendamento for marcado como Concluído
                        </span>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.84rem' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(config.autoSendWhatsApp ?? config.autoSendWhatsapp ?? true)}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              autoSendWhatsApp: e.target.checked,
                              autoSendWhatsapp: e.target.checked,
                            })
                          }
                        />
                        <span>
                          <strong>Enviar link da DANFSE automaticamente no WhatsApp</strong> do cliente após autorizar a nota
                        </span>
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={savingConfig}
                      className="btn-primary"
                      style={{
                        padding: '12px 18px',
                        borderRadius: '10px',
                        fontWeight: 700,
                        marginTop: '4px',
                      }}
                    >
                      {savingConfig ? 'Salvando Configurações...' : 'Salvar Configurações Fiscais'}
                    </button>
                  </form>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      <Modal
        isOpen={emitModalOpen}
        onClose={() => setEmitModalOpen(false)}
        title={emitForm.appointmentId ? 'Emitir NFS-e do Atendimento' : 'Emitir Nova NFS-e Avulsa'}
      >
        <form onSubmit={handleEmitSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Nome do Cliente (Tomador) *
              </label>
              <input
                type="text"
                required
                value={emitForm.tomadorNome}
                onChange={(e) => setEmitForm({ ...emitForm, tomadorNome: e.target.value })}
                className="input-field"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                CPF ou CNPJ na Nota (Opcional)
              </label>
              <input
                type="text"
                placeholder="000.000.000-00"
                value={emitForm.tomadorDocumento}
                onChange={(e) => setEmitForm({ ...emitForm, tomadorDocumento: e.target.value })}
                className="input-field"
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                WhatsApp do Cliente
              </label>
              <input
                type="text"
                placeholder="11999999999"
                value={emitForm.tomadorTelefone}
                onChange={(e) => setEmitForm({ ...emitForm, tomadorTelefone: e.target.value })}
                className="input-field"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Valor Total do Serviço (R$) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={emitForm.valorReais}
                onChange={(e) => setEmitForm({ ...emitForm, valorReais: e.target.value })}
                className="input-field"
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Discriminação dos Serviços *
            </label>
            <textarea
              rows={3}
              required
              value={emitForm.discriminacao}
              onChange={(e) => setEmitForm({ ...emitForm, discriminacao: e.target.value })}
              className="input-field"
              style={{ width: '100%' }}
            />
          </div>

          {emitForm.appointmentId && emitForm.cotaPartePct > 0 && (
            <label
              style={{
                padding: '12px',
                borderRadius: '10px',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '0.83rem',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={emitForm.aplicarSalaoParceiro}
                onChange={(e) => setEmitForm({ ...emitForm, aplicarSalaoParceiro: e.target.checked })}
              />
              <span>
                Aplicar dedução da <strong>Lei do Salão-Parceiro</strong> ({emitForm.cotaPartePct}% de {emitForm.profissionalNome}) na base de cálculo do ISS
              </span>
            </label>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.83rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={emitForm.sendWhatsapp}
              onChange={(e) => setEmitForm({ ...emitForm, sendWhatsapp: e.target.checked })}
            />
            <span>Enviar link da DANFSE automaticamente no WhatsApp do cliente</span>
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={() => setEmitModalOpen(false)}
              style={{
                padding: '10px 16px',
                borderRadius: '10px',
                background: 'rgba(255,255,255,0.06)',
                border: 'none',
                color: 'var(--text-main)',
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={emitting}
              className="btn-primary"
              style={{ padding: '10px 20px', borderRadius: '10px', fontWeight: 700 }}
            >
              {emitting ? 'Transmitindo DPS / NFS-e...' : 'Transmitir e Emitir NFS-e'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={addonCheckoutOpen}
        onClose={() => setAddonCheckoutOpen(false)}
        title={`Ativar Módulo Emissor NFS-e (${formatBRL(addonPriceCents)}/mês)`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={() => setCheckoutMethod('PIX')}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '10px',
                border: checkoutMethod === 'PIX' ? '1px solid #E5B338' : '1px solid rgba(255,255,255,0.1)',
                background: checkoutMethod === 'PIX' ? 'rgba(229, 179, 56, 0.14)' : 'rgba(255,255,255,0.03)',
                color: checkoutMethod === 'PIX' ? '#E5B338' : 'var(--text-muted)',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <QrCode size={16} /> PIX Imediato
            </button>
            <button
              type="button"
              onClick={() => setCheckoutMethod('CARD')}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '10px',
                border: checkoutMethod === 'CARD' ? '1px solid #E5B338' : '1px solid rgba(255,255,255,0.1)',
                background: checkoutMethod === 'CARD' ? 'rgba(229, 179, 56, 0.14)' : 'rgba(255,255,255,0.03)',
                color: checkoutMethod === 'CARD' ? '#E5B338' : 'var(--text-muted)',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <CreditCard size={16} /> Cartão de Crédito
            </button>
          </div>

          {checkoutMethod === 'PIX' ? (
            !pixData ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  CPF ou CNPJ do titular (opcional):
                </label>
                <input
                  type="text"
                  placeholder="000.000.000-00"
                  value={payerCpf}
                  onChange={(e) => setPayerCpf(e.target.value)}
                  className="input-field"
                />
                <button
                  type="button"
                  onClick={handleGenerateAddonPix}
                  disabled={addonLoading}
                  className="btn-primary"
                  style={{ padding: '12px', borderRadius: '10px', fontWeight: 700 }}
                >
                  {addonLoading ? 'Gerando QR Code PIX...' : `Gerar QR Code PIX (${formatBRL(addonPriceCents)})`}
                </button>
              </div>
            ) : (
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
                {pixData.qrCodeBase64 && (
                  <img
                    src={`data:image/png;base64,${pixData.qrCodeBase64}`}
                    alt="QR Code PIX"
                    style={{ width: '200px', height: '200px', borderRadius: '12px', background: '#fff', padding: '8px' }}
                  />
                )}
                <div style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>
                  Escaneie o QR Code ou copie o código PIX Copia e Cola abaixo. A liberação ocorre automaticamente em segundos!
                </div>
                <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                  <input
                    type="text"
                    readOnly
                    value={pixData.qrCode}
                    className="input-field"
                    style={{ flex: 1, fontSize: '0.78rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(pixData.qrCode);
                      setCopiedPix(true);
                      setTimeout(() => setCopiedPix(false), 2500);
                    }}
                    className="btn-primary"
                    style={{ padding: '0 14px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    {copiedPix ? <Check size={15} /> : <Copy size={15} />}
                    {copiedPix ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
              </div>
            )
          ) : (
            <form onSubmit={handlePayAddonCard} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input
                type="text"
                required
                placeholder="Número do Cartão"
                value={cardForm.cardNumber}
                onChange={(e) => setCardForm({ ...cardForm, cardNumber: e.target.value })}
                className="input-field"
              />
              <input
                type="text"
                required
                placeholder="Nome impresso no cartão"
                value={cardForm.cardholderName}
                onChange={(e) => setCardForm({ ...cardForm, cardholderName: e.target.value })}
                className="input-field"
              />
              <input
                type="text"
                required
                placeholder="CPF do titular"
                value={cardForm.cardholderCpf}
                onChange={(e) => setCardForm({ ...cardForm, cardholderCpf: e.target.value })}
                className="input-field"
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <input
                  type="text"
                  required
                  placeholder="Mês (MM)"
                  value={cardForm.expMonth}
                  onChange={(e) => setCardForm({ ...cardForm, expMonth: e.target.value })}
                  className="input-field"
                />
                <input
                  type="text"
                  required
                  placeholder="Ano (AAAA)"
                  value={cardForm.expYear}
                  onChange={(e) => setCardForm({ ...cardForm, expYear: e.target.value })}
                  className="input-field"
                />
                <input
                  type="text"
                  required
                  placeholder="CVV"
                  value={cardForm.cvv}
                  onChange={(e) => setCardForm({ ...cardForm, cvv: e.target.value })}
                  className="input-field"
                />
              </div>
              <button
                type="submit"
                disabled={addonLoading}
                className="btn-primary"
                style={{ padding: '12px', borderRadius: '10px', fontWeight: 700, marginTop: '6px' }}
              >
                {addonLoading ? 'Processando...' : `Pagar e Ativar por ${formatBRL(addonPriceCents)}`}
              </button>
            </form>
          )}
        </div>
      </Modal>
    </div>
  );
}
