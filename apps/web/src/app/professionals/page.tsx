'use client';

import React, { useEffect, useState } from 'react';
import {
  Users,
  Plus,
  Edit2,
  Trash2,
  Phone,
  Percent,
  Shield,
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  Calendar as CalendarIcon,
  Check,
  Sparkles,
  Scissors,
  DollarSign,
  UserCheck,
  Settings,
  HelpCircle,
  Briefcase,
  MessageSquare,
  Mail,
  Copy,
  Send,
  Key,
  ExternalLink,
  RotateCcw,
  AlertTriangle,
  UserX,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { Sidebar } from '../../components/Sidebar';
import { Header } from '../../components/Header';
import { Modal } from '../../components/Modal';

export type PresetType = 'ADMIN' | 'RECEPTION' | 'BARBER' | 'FINANCE' | 'CUSTOM';

export interface UserPermissions {
  preset?: PresetType;
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
}

interface ProfessionalUser {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  permissions?: UserPermissions | null;
}

interface Professional {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  color: string;
  commissionPercent: number;
  isActive: boolean;
  serviceIds: string[];
  user?: ProfessionalUser | null;
}

interface Service {
  id: string;
  name: string;
}

interface PresetDefinition {
  id: PresetType;
  title: string;
  badgeLabel: string;
  description: string;
  badgeColor: string;
  badgeBg: string;
  defaultRoleTitle: string;
  isServiceWorker: boolean;
  allowedMenus: string[];
  canViewAllAppointments: boolean;
  canManageAppointments: boolean;
  canManageCustomers: boolean;
  canManageServices: boolean;
  canViewFinancials: boolean;
  canManageFinancials: boolean;
  canManageTeam: boolean;
  canManageSettings: boolean;
}

const ROLE_PRESETS: PresetDefinition[] = [
  {
    id: 'ADMIN',
    title: 'Administrador / Gerente',
    badgeLabel: 'Administrador',
    description: 'Gestão completa do salão, financeiro, clientes, serviços e equipe.',
    badgeColor: '#E5B338',
    badgeBg: 'rgba(229, 179, 56, 0.15)',
    defaultRoleTitle: 'Administrador / Gerente',
    isServiceWorker: false,
    allowedMenus: ['dashboard', 'calendar', 'professionals', 'services', 'customers', 'finance', 'whatsapp', 'settings'],
    canViewAllAppointments: true,
    canManageAppointments: true,
    canManageCustomers: true,
    canManageServices: true,
    canViewFinancials: true,
    canManageFinancials: true,
    canManageTeam: true,
    canManageSettings: true,
  },
  {
    id: 'RECEPTION',
    title: 'Recepção / Atendimento',
    badgeLabel: 'Recepção',
    description: 'Gerencia a agenda de todos os barbeiros e a base de clientes.',
    badgeColor: '#38BDF8',
    badgeBg: 'rgba(56, 189, 248, 0.15)',
    defaultRoleTitle: 'Recepção / Atendimento',
    isServiceWorker: false,
    allowedMenus: ['dashboard', 'calendar', 'customers'],
    canViewAllAppointments: true,
    canManageAppointments: true,
    canManageCustomers: true,
    canManageServices: false,
    canViewFinancials: false,
    canManageFinancials: false,
    canManageTeam: false,
    canManageSettings: false,
  },
  {
    id: 'BARBER',
    title: 'Barbeiro / Profissional',
    badgeLabel: 'Barbeiro',
    description: 'Atende clientes na cadeira e vê estritamente sua própria agenda.',
    badgeColor: '#A78BFA',
    badgeBg: 'rgba(167, 139, 250, 0.15)',
    defaultRoleTitle: 'Barbeiro',
    isServiceWorker: true,
    allowedMenus: ['calendar'],
    canViewAllAppointments: false,
    canManageAppointments: false,
    canManageCustomers: false,
    canManageServices: false,
    canViewFinancials: false,
    canManageFinancials: false,
    canManageTeam: false,
    canManageSettings: false,
  },
  {
    id: 'FINANCE',
    title: 'Financeiro / Caixa',
    badgeLabel: 'Financeiro',
    description: 'Controle de fluxo de caixa, pagamentos, entradas e despesas.',
    badgeColor: '#34D399',
    badgeBg: 'rgba(52, 211, 153, 0.15)',
    defaultRoleTitle: 'Financeiro / Caixa',
    isServiceWorker: false,
    allowedMenus: ['dashboard', 'finance', 'customers'],
    canViewAllAppointments: false,
    canManageAppointments: false,
    canManageCustomers: true,
    canManageServices: false,
    canViewFinancials: true,
    canManageFinancials: true,
    canManageTeam: false,
    canManageSettings: false,
  },
  {
    id: 'CUSTOM',
    title: 'Personalizado',
    badgeLabel: 'Personalizado',
    description: 'Defina permissões personalizadas sob medida para esta pessoa.',
    badgeColor: '#F472B6',
    badgeBg: 'rgba(244, 114, 182, 0.15)',
    defaultRoleTitle: 'Cargo Personalizado',
    isServiceWorker: false,
    allowedMenus: ['calendar'],
    canViewAllAppointments: false,
    canManageAppointments: false,
    canManageCustomers: false,
    canManageServices: false,
    canViewFinancials: false,
    canManageFinancials: false,
    canManageTeam: false,
    canManageSettings: false,
  },
];

const AVAILABLE_MENUS: { key: string; label: string; description: string }[] = [
  { key: 'dashboard', label: 'Dashboard', description: 'Visão geral e métricas' },
  { key: 'calendar', label: 'Calendário & Agenda', description: 'Visualizar e criar agendamentos' },
  { key: 'professionals', label: 'Equipe & Acessos', description: 'Gerenciar membros e permissões' },
  { key: 'services', label: 'Serviços & Preços', description: 'Catálogo de serviços e valores' },
  { key: 'customers', label: 'Clientes', description: 'Base e histórico de clientes' },
  { key: 'finance', label: 'Fluxo de Caixa', description: 'Receitas, despesas e faturamento' },
  { key: 'whatsapp', label: 'Bot WhatsApp', description: 'QR Code e automações de mensagens' },
  { key: 'settings', label: 'Configurações', description: 'Horários de funcionamento do salão' },
];

function CustomCheckbox({ checked }: { checked: boolean }) {
  return (
    <div
      style={{
        width: '18px',
        height: '18px',
        minWidth: '18px',
        minHeight: '18px',
        borderRadius: '5px',
        border: checked ? '1.5px solid var(--primary)' : '1px solid var(--border-color)',
        background: checked ? 'var(--primary)' : 'rgba(255, 255, 255, 0.04)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'all 0.15s ease',
      }}
    >
      {checked && <Check size={12} color="#0B0F17" strokeWidth={3} />}
    </div>
  );
}

export default function ProfessionalsPage() {
  const { subscription, tenant } = useAuth();
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isServiceWorker, setIsServiceWorker] = useState(true);
  const [color, setColor] = useState('#E5B338');
  const [commissionPercent, setCommissionPercent] = useState(0);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Login & Credentials
  const [hasLogin, setHasLogin] = useState(false);
  const [existingHasLogin, setExistingHasLogin] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Invite states
  const [inviteCopied, setInviteCopied] = useState(false);
  const [sendingBotInvite, setSendingBotInvite] = useState(false);
  const [botInviteSuccess, setBotInviteSuccess] = useState<string | null>(null);

  // Filter tab & Deletion modal states
  const [filterTab, setFilterTab] = useState<'active' | 'inactive' | 'all'>('active');
  const [deleteTarget, setDeleteTarget] = useState<Professional | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Role preset & Granular permissions
  const [preset, setPreset] = useState<PresetType>('BARBER');
  const [roleTitle, setRoleTitle] = useState('Barbeiro');
  const [allowedMenus, setAllowedMenus] = useState<string[]>(['calendar']);
  const [canViewAllAppointments, setCanViewAllAppointments] = useState(false);
  const [canManageAppointments, setCanManageAppointments] = useState(false);
  const [canManageCustomers, setCanManageCustomers] = useState(false);
  const [canManageServices, setCanManageServices] = useState(false);
  const [canViewFinancials, setCanViewFinancials] = useState(false);
  const [canManageFinancials, setCanManageFinancials] = useState(false);
  const [canManageTeam, setCanManageTeam] = useState(false);
  const [canManageSettings, setCanManageSettings] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pRes, sRes] = await Promise.all([
        api.get<{ professionals: Professional[] }>('/api/professionals'),
        api.get<{ services: Service[] }>('/api/services?active=true'),
      ]);
      setProfessionals(pRes.professionals);
      setServices(sRes.services);
    } catch {
      // Ignora erro
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  const getCleanPhone = (rawPhone?: string | null) => {
    if (!rawPhone) return '';
    const digits = rawPhone.replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 10 || digits.length === 11) {
      return `55${digits}`;
    }
    return digits;
  };

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
    let pass = '';
    const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lowers = 'abcdefghijkmnpqrstuvwxyz';
    const nums = '23456789';
    const specs = '!@#$';
    pass += uppers[Math.floor(Math.random() * uppers.length)];
    pass += lowers[Math.floor(Math.random() * lowers.length)];
    pass += lowers[Math.floor(Math.random() * lowers.length)];
    pass += nums[Math.floor(Math.random() * nums.length)];
    pass += nums[Math.floor(Math.random() * nums.length)];
    pass += specs[Math.floor(Math.random() * specs.length)];
    for (let i = 0; i < 3; i++) {
      pass += chars[Math.floor(Math.random() * chars.length)];
    }
    setLoginPassword(pass);
    setShowPassword(true);
  };

  const buildInviteText = (opts?: {
    targetName?: string;
    targetEmail?: string;
    targetRole?: string;
    password?: string;
  }) => {
    const targetName = opts?.targetName || name || 'Membro da Equipe';
    const targetEmail = opts?.targetEmail || loginEmail || 'seu-email@barberflow.com';
    const targetRole = opts?.targetRole || roleTitle || 'Profissional';
    const pwd = opts?.password !== undefined ? opts.password : loginPassword;
    const salonName = tenant?.name || 'BarberFlow';
    const loginUrl = `${origin || (typeof window !== 'undefined' ? window.location.origin : '')}/login`;

    let text = `Olá, *${targetName}*! 👋\n\n`;
    text += `Seu acesso ao sistema *BarberFlow* da *${salonName}* foi liberado com sucesso.\n\n`;
    text += `👤 *Cargo / Função:* ${targetRole}\n`;
    text += `🔗 *Link de Acesso:* ${loginUrl}\n`;
    text += `✉️ *E-mail de Login:* ${targetEmail}\n`;
    if (pwd) {
      text += `🔑 *Senha provisória:* ${pwd}\n\n`;
      text += `Recomendamos trocar sua senha após o primeiro acesso.\n\n`;
    } else {
      text += `🔑 *Senha:* Utilize a senha informada pela gerência.\n\n`;
    }
    text += `Acesse pelo seu celular ou computador para consultar sua agenda e atendimentos! 💈✂️`;
    return text;
  };

  const handleOpenWhatsApp = (targetPhone?: string | null, inviteMessage?: string) => {
    const p = targetPhone || phone;
    const digits = getCleanPhone(p);
    const msg = inviteMessage || buildInviteText();
    const url = digits
      ? `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  const handleOpenEmail = (targetEmail?: string | null, inviteMessage?: string) => {
    const target = targetEmail || loginEmail;
    if (!target) {
      alert('Informe o e-mail de login para enviar o convite.');
      return;
    }
    const salonName = tenant?.name || 'BarberFlow';
    const subject = `Seus dados de acesso ao BarberFlow - ${salonName}`;
    const body = inviteMessage || buildInviteText();
    window.location.href = `mailto:${target}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const handleCopyInvite = (customText?: string) => {
    const text = customText || buildInviteText();
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text);
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      textArea.remove();
    }
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2500);
  };

  const handleSendBotInvite = async (profId: string) => {
    if (!profId) return;
    setSendingBotInvite(true);
    setBotInviteSuccess(null);
    try {
      const res = await api.post<{ success: boolean; message: string; channel: string }>(
        `/api/professionals/${profId}/send-invite`,
        {
          channel: 'WHATSAPP_BOT',
          tempPassword: loginPassword || undefined,
        }
      );
      setBotInviteSuccess(res.message || 'Convite enviado com sucesso via WhatsApp!');
      setTimeout(() => setBotInviteSuccess(null), 4000);
    } catch (err: unknown) {
      alert(err instanceof ApiError ? err.message : 'Falha ao disparar pelo bot do salão.');
    } finally {
      setSendingBotInvite(false);
    }
  };

  const applyPreset = (p: PresetType, keepServiceWorkerSetting = false) => {
    setPreset(p);
    const def = ROLE_PRESETS.find((r) => r.id === p);
    if (!def) return;
    setRoleTitle(def.defaultRoleTitle);
    if (!keepServiceWorkerSetting) {
      setIsServiceWorker(def.isServiceWorker);
    }
    setAllowedMenus(def.allowedMenus);
    setCanViewAllAppointments(def.canViewAllAppointments);
    setCanManageAppointments(def.canManageAppointments);
    setCanManageCustomers(def.canManageCustomers);
    setCanManageServices(def.canManageServices);
    setCanViewFinancials(def.canViewFinancials);
    setCanManageFinancials(def.canManageFinancials);
    setCanManageTeam(def.canManageTeam);
    setCanManageSettings(def.canManageSettings);
  };

  const openCreateModal = (initialPreset: PresetType = 'BARBER') => {
    setEditingId(null);
    setName('');
    setPhone('');
    setColor('#E5B338');
    setCommissionPercent(0);
    setSelectedServices(services.map((s) => s.id));
    setHasLogin(true);
    setExistingHasLogin(false);
    setLoginEmail('');
    setLoginPassword('');
    setShowPassword(false);
    setInviteCopied(false);
    setBotInviteSuccess(null);
    setErrorMsg(null);
    applyPreset(initialPreset);
    setIsModalOpen(true);
  };

  const openEditModal = (p: Professional) => {
    setEditingId(p.id);
    setName(p.name);
    setPhone(p.phone || '');
    setColor(p.color || '#E5B338');
    setCommissionPercent(p.commissionPercent || 0);
    setSelectedServices(p.serviceIds || []);

    const user = p.user;
    const hasUser = !!(user && user.isActive);
    setHasLogin(hasUser);
    setExistingHasLogin(hasUser);
    setLoginEmail(user?.email || p.email || '');
    setLoginPassword('');
    setShowPassword(false);
    setInviteCopied(false);
    setBotInviteSuccess(null);

    const perms = user?.permissions;
    const detectedPreset: PresetType =
      perms?.preset || (user?.role === 'MANAGER' ? 'ADMIN' : 'BARBER');
    setPreset(detectedPreset);
    setRoleTitle(
      perms?.roleTitle ||
        (detectedPreset === 'ADMIN'
          ? 'Administrador / Gerente'
          : detectedPreset === 'RECEPTION'
          ? 'Recepção / Atendimento'
          : detectedPreset === 'FINANCE'
          ? 'Financeiro / Caixa'
          : 'Barbeiro')
    );

    // Se tem serviços associados ou comissão, atende na agenda
    const worker = (p.serviceIds && p.serviceIds.length > 0) || (p.commissionPercent || 0) > 0;
    setIsServiceWorker(worker);

    setAllowedMenus(
      perms?.allowedMenus && perms.allowedMenus.length > 0
        ? perms.allowedMenus
        : ['calendar']
    );
    setCanViewAllAppointments(Boolean(perms?.canViewAllAppointments));
    setCanManageAppointments(Boolean(perms?.canManageAppointments));
    setCanManageCustomers(Boolean(perms?.canManageCustomers));
    setCanManageServices(Boolean(perms?.canManageServices));
    setCanViewFinancials(Boolean(perms?.canViewFinancials));
    setCanManageFinancials(Boolean(perms?.canManageFinancials));
    setCanManageTeam(Boolean(perms?.canManageTeam));
    setCanManageSettings(Boolean(perms?.canManageSettings));

    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (hasLogin) {
      if (!loginEmail.trim() || !loginEmail.includes('@')) {
        setErrorMsg('Informe um e-mail válido para o acesso do membro da equipe.');
        return;
      }
      if (!existingHasLogin && (!loginPassword || loginPassword.length < 6)) {
        setErrorMsg('Para habilitar o primeiro acesso, defina uma senha com no mínimo 6 caracteres.');
        return;
      }
      if (allowedMenus.length === 0) {
        setErrorMsg('Selecione ao menos 1 menu permitido para o acesso.');
        return;
      }
    }

    setSubmitting(true);

    try {
      const payload: Record<string, any> = {
        name,
        phone: phone || null,
        color: isServiceWorker ? color : '#64748B',
        commissionPercent: isServiceWorker ? Number(commissionPercent) : 0,
        serviceIds: isServiceWorker ? selectedServices : [],
        hasLogin,
        loginEmail: hasLogin ? loginEmail.trim().toLowerCase() : undefined,
        loginPassword: hasLogin && loginPassword ? loginPassword : undefined,
        permissions: hasLogin
          ? {
              preset,
              roleTitle: roleTitle.trim() || undefined,
              allowedMenus,
              canViewAllAppointments,
              canManageAppointments,
              canManageCustomers,
              canManageServices,
              canViewFinancials,
              canManageFinancials,
              canManageTeam,
              canManageSettings,
            }
          : undefined,
      };

      if (editingId) {
        await api.patch(`/api/professionals/${editingId}`, payload);
      } else {
        await api.post('/api/professionals', payload);
      }

      setIsModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Falha ao salvar membro da equipe.');
    } finally {
      setSubmitting(false);
    }
  };

  const showActionSuccess = (msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => setActionSuccessMsg(null), 4500);
  };

  const handleReactivate = async (p: Professional) => {
    try {
      await api.patch(`/api/professionals/${p.id}`, { isActive: true });
      showActionSuccess(`Profissional "${p.name}" foi reativado na equipe com sucesso!`);
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof ApiError ? err.message : 'Falha ao reativar profissional.');
    }
  };

  const executeDeactivate = async (id: string) => {
    setIsDeleting(true);
    try {
      await api.delete(`/api/professionals/${id}`);
      setDeleteTarget(null);
      showActionSuccess('Profissional desativado da equipe. O histórico financeiro foi mantido.');
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof ApiError ? err.message : 'Falha ao desativar profissional.');
    } finally {
      setIsDeleting(false);
    }
  };

  const executeForceDelete = async (id: string) => {
    setIsDeleting(true);
    try {
      await api.delete(`/api/professionals/${id}?force=true`);
      setDeleteTarget(null);
      showActionSuccess('Profissional e histórico excluídos definitivamente do sistema.');
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof ApiError ? err.message : 'Falha ao excluir profissional.');
    } finally {
      setIsDeleting(false);
    }
  };

  const maxProfs = subscription?.limits.maxProfessionals;
  const activeCount = professionals.filter((p) => p.isActive).length;
  const inactiveCount = professionals.filter((p) => !p.isActive).length;

  const filteredProfessionals = professionals.filter((p) => {
    if (filterTab === 'active') return p.isActive;
    if (filterTab === 'inactive') return !p.isActive;
    return true;
  });

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Header />

        <main style={{ padding: '32px', flex: 1, maxWidth: '1400px', width: '100%', margin: '0 auto' }}>
          {/* Top Bar Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <h1 style={{ fontSize: '1.85rem', fontWeight: 700 }}>Equipe & Profissionais</h1>
                <span className="gold-badge" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
                  Gestão & Permissões
                </span>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Gerencie barbeiros, equipe administrativa, níveis de permissão personalizados e comissões.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {maxProfs !== null && (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Limite do plano: <strong style={{ color: 'var(--text-main)' }}>{activeCount} / {maxProfs}</strong>
                </div>
              )}

              <button
                onClick={() => openCreateModal('BARBER')}
                className="gold-gradient-primary gold-glow"
                style={{ padding: '10px 18px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={16} />
                <span>Adicionar Membro</span>
              </button>
            </div>
          </div>

          {/* Action Success Toast Banner */}
          {actionSuccessMsg && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#10B981',
                fontSize: '0.85rem',
                fontWeight: 500,
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Check size={16} />
              <span>{actionSuccessMsg}</span>
            </div>
          )}

          {/* List of Professionals & Team Members */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            {/* Filter Tabs */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255, 255, 255, 0.03)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <button
                  type="button"
                  onClick={() => setFilterTab('active')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    fontWeight: filterTab === 'active' ? 600 : 500,
                    background: filterTab === 'active' ? 'var(--primary)' : 'transparent',
                    color: filterTab === 'active' ? '#0B0F17' : 'var(--text-muted)',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Ativos ({activeCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab('inactive')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    fontWeight: filterTab === 'inactive' ? 600 : 500,
                    background: filterTab === 'inactive' ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                    color: filterTab === 'inactive' ? '#EF4444' : 'var(--text-muted)',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Inativos ({inactiveCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab('all')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    fontWeight: filterTab === 'all' ? 600 : 500,
                    background: filterTab === 'all' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                    color: filterTab === 'all' ? 'var(--text-main)' : 'var(--text-muted)',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Todos ({professionals.length})
                </button>
              </div>
            </div>

            {loading ? (
              <p style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '30px' }}>Carregando equipe...</p>
            ) : filteredProfessionals.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                <Users size={40} color="var(--text-dim)" style={{ marginBottom: '12px' }} />
                <p>
                  {filterTab === 'active'
                    ? 'Nenhum profissional ativo na equipe.'
                    : filterTab === 'inactive'
                    ? 'Nenhum membro desativado.'
                    : 'Nenhum profissional ou membro cadastrado.'}
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '18px' }}>
                {filteredProfessionals.map((p) => {
                  const userPerms = p.user?.permissions;
                  const cardPresetId = userPerms?.preset || (p.user?.role === 'MANAGER' ? 'ADMIN' : 'BARBER');
                  const presetDef = ROLE_PRESETS.find((r) => r.id === cardPresetId) || ROLE_PRESETS[4];
                  const hasCustomTitle = Boolean(userPerms?.roleTitle && userPerms.roleTitle !== presetDef.badgeLabel);
                  const isWorker = (p.serviceIds && p.serviceIds.length > 0) || (p.commissionPercent || 0) > 0;

                  return (
                    <div
                      key={p.id}
                      className="glass-card"
                      style={{
                        padding: '20px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '14px',
                        opacity: p.isActive ? 1 : 0.6,
                        border: '1px solid var(--border-color)',
                        position: 'relative',
                        transition: 'transform 0.15s ease, border-color 0.15s ease',
                      }}
                    >
                      <div>
                        {/* Header do Card */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div
                              style={{
                                width: '44px',
                                height: '44px',
                                borderRadius: '12px',
                                background: isWorker ? (p.color || '#E5B338') : '#334155',
                                color: isWorker ? '#0B0F17' : '#F8FAFC',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '1.25rem',
                                boxShadow: isWorker ? `0 0 16px ${p.color || '#E5B338'}33` : 'none',
                              }}
                            >
                              {p.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <h4 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-main)' }}>{p.name}</h4>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', flexWrap: 'wrap' }}>
                                {/* Badge de Perfil / Cargo */}
                                <span
                                  style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    padding: '2px 7px',
                                    borderRadius: '5px',
                                    background: presetDef.badgeBg,
                                    color: presetDef.badgeColor,
                                    border: `1px solid ${presetDef.badgeColor}40`,
                                  }}
                                >
                                  {hasCustomTitle ? userPerms?.roleTitle : presetDef.badgeLabel}
                                </span>

                                {/* Badge de Atuação */}
                                <span
                                  style={{
                                    fontSize: '0.72rem',
                                    padding: '2px 7px',
                                    borderRadius: '5px',
                                    background: isWorker ? 'rgba(255,255,255,0.06)' : 'rgba(56, 189, 248, 0.08)',
                                    color: isWorker ? 'var(--text-muted)' : '#7DD3FC',
                                    border: '1px solid var(--border-color)',
                                  }}
                                >
                                  {isWorker ? 'Corta cabelo' : 'Apoio Administrativo'}
                                </span>

                                {!p.isActive && (
                                  <span
                                    style={{
                                      fontSize: '0.72rem',
                                      fontWeight: 600,
                                      padding: '2px 7px',
                                      borderRadius: '5px',
                                      background: 'rgba(239, 68, 68, 0.12)',
                                      color: '#EF4444',
                                      border: '1px solid rgba(239, 68, 68, 0.3)',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                    }}
                                  >
                                    <UserX size={11} />
                                    <span>Desativado</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {p.isActive && p.user && p.user.isActive && (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const msg = buildInviteText({
                                      targetName: p.name,
                                      targetEmail: p.user?.email || p.email || '',
                                      targetRole: p.user?.permissions?.roleTitle || presetDef.badgeLabel,
                                      password: '',
                                    });
                                    handleOpenWhatsApp(p.phone, msg);
                                  }}
                                  title="Enviar dados de acesso via WhatsApp"
                                  style={{
                                    background: 'rgba(37, 211, 102, 0.1)',
                                    border: '1px solid rgba(37, 211, 102, 0.25)',
                                    color: '#25D366',
                                    cursor: 'pointer',
                                    padding: '6px',
                                    borderRadius: '6px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  <MessageSquare size={15} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const msg = buildInviteText({
                                      targetName: p.name,
                                      targetEmail: p.user?.email || p.email || '',
                                      targetRole: p.user?.permissions?.roleTitle || presetDef.badgeLabel,
                                      password: '',
                                    });
                                    handleCopyInvite(msg);
                                  }}
                                  title="Copiar dados de acesso"
                                  style={{
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid var(--border-color)',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer',
                                    padding: '6px',
                                    borderRadius: '6px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                  }}
                                >
                                  <Copy size={15} />
                                </button>
                              </>
                            )}
                            {p.isActive ? (
                              <>
                                <button
                                  onClick={() => openEditModal(p)}
                                  title="Editar e Permissões"
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer',
                                    padding: '6px',
                                    borderRadius: '6px',
                                  }}
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  onClick={() => setDeleteTarget(p)}
                                  title="Remover / Desativar"
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#FB7185',
                                    cursor: 'pointer',
                                    padding: '6px',
                                    borderRadius: '6px',
                                  }}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleReactivate(p)}
                                  title="Reativar Membro na Equipe"
                                  style={{
                                    background: 'rgba(16, 185, 129, 0.12)',
                                    border: '1px solid rgba(16, 185, 129, 0.3)',
                                    color: '#10B981',
                                    cursor: 'pointer',
                                    padding: '5px 9px',
                                    borderRadius: '6px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    fontSize: '0.76rem',
                                    fontWeight: 600,
                                  }}
                                >
                                  <RotateCcw size={13} />
                                  <span>Reativar</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget(p)}
                                  title="Excluir Definitivamente"
                                  style={{
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    border: '1px solid rgba(239, 68, 68, 0.25)',
                                    color: '#EF4444',
                                    cursor: 'pointer',
                                    padding: '6px',
                                    borderRadius: '6px',
                                    display: 'flex',
                                    alignItems: 'center',
                                  }}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Dados de contato e comissão */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                          {p.phone && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Phone size={13} color="var(--primary)" />
                              <span>{p.phone}</span>
                            </div>
                          )}
                          {isWorker && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Percent size={13} color="var(--primary)" />
                              <span>Comissão sobre serviços: <strong style={{ color: 'var(--text-main)' }}>{p.commissionPercent}%</strong></span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Status de Acesso & Segurança */}
                      <div
                        style={{
                          marginTop: '6px',
                          paddingTop: '12px',
                          borderTop: '1px solid var(--border-color)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                          {!p.isActive ? (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '0.76rem',
                                color: '#EF4444',
                                background: 'rgba(239, 68, 68, 0.08)',
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                padding: '3px 8px',
                                borderRadius: '6px',
                              }}
                            >
                              <UserX size={13} />
                              <span style={{ fontWeight: 600 }}>Equipe Inativa</span>
                            </div>
                          ) : p.user && p.user.isActive ? (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '0.76rem',
                                color: '#10B981',
                                background: 'rgba(16, 185, 129, 0.1)',
                                border: '1px solid rgba(16, 185, 129, 0.25)',
                                padding: '3px 8px',
                                borderRadius: '6px',
                              }}
                            >
                              <ShieldCheck size={13} />
                              <span style={{ fontWeight: 600 }}>Login Ativo</span>
                            </div>
                          ) : (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '0.76rem',
                                color: 'var(--text-dim)',
                                background: 'rgba(255, 255, 255, 0.04)',
                                border: '1px solid var(--border-color)',
                                padding: '3px 8px',
                                borderRadius: '6px',
                              }}
                            >
                              <Lock size={13} />
                              <span>Sem login</span>
                            </div>
                          )}

                          {p.user && p.user.isActive && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                              <CalendarIcon size={12} color="var(--primary)" />
                              <span>
                                {userPerms?.canViewAllAppointments ? 'Agenda de todos' : 'Apenas própria agenda'}
                              </span>
                            </div>
                          )}
                        </div>

                        {p.user && p.user.isActive && (
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <Shield size={12} color="var(--primary)" />
                            <span>
                              {userPerms?.allowedMenus && userPerms.allowedMenus.length > 0
                                ? `${userPerms.allowedMenus.length} menu(s) liberado(s)`
                                : 'Apenas Calendário'}
                            </span>
                            {userPerms?.canViewFinancials && (
                              <span style={{ color: '#34D399', fontSize: '0.72rem' }}>• Caixa</span>
                            )}
                            {userPerms?.canManageTeam && (
                              <span style={{ color: '#E5B338', fontSize: '0.72rem' }}>• Equipe</span>
                            )}
                            {p.user.email && (
                              <span
                                style={{
                                  marginLeft: 'auto',
                                  opacity: 0.75,
                                  maxWidth: '140px',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {p.user.email}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Modal: Adicionar/Editar Membro da Equipe & Permissões */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Editar Membro da Equipe & Permissões' : 'Novo Membro da Equipe'}
      >
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

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Seção 1: Dados do Membro */}
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Nome Completo *
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Carlos Oliveira"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              WhatsApp / Telefone
            </label>
            <input
              type="text"
              placeholder="(11) 98888-7777"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          {/* Tipo de Atuação: Corta cabelo VS Apoio Administrativo */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              Tipo de Atuação no Salão:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div
                onClick={() => setIsServiceWorker(true)}
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  border: isServiceWorker ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                  background: isServiceWorker ? 'rgba(229, 179, 56, 0.1)' : 'var(--bg-input)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  transition: 'all 0.15s ease',
                }}
              >
                <Scissors size={18} color={isServiceWorker ? 'var(--primary)' : 'var(--text-dim)'} style={{ marginTop: '2px' }} />
                <div>
                  <div style={{ fontSize: '0.86rem', fontWeight: 600, color: isServiceWorker ? 'var(--text-main)' : 'var(--text-muted)' }}>
                    Profissional de Atendimento
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                    Barbeiro ou cabeleireiro que atende clientes na cadeira.
                  </div>
                </div>
              </div>

              <div
                onClick={() => setIsServiceWorker(false)}
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  border: !isServiceWorker ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                  background: !isServiceWorker ? 'rgba(229, 179, 56, 0.1)' : 'var(--bg-input)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  transition: 'all 0.15s ease',
                }}
              >
                <Briefcase size={18} color={!isServiceWorker ? 'var(--primary)' : 'var(--text-dim)'} style={{ marginTop: '2px' }} />
                <div>
                  <div style={{ fontSize: '0.86rem', fontWeight: 600, color: !isServiceWorker ? 'var(--text-main)' : 'var(--text-muted)' }}>
                    Apoio / Equipe Administrativa
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                    Recepção, gerente, financeiro ou caixa (não corta cabelo).
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Se atende na agenda: comissão, cor e serviços */}
          {isServiceWorker && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                padding: '14px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Cor no Calendário
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      style={{ width: '44px', height: '38px', padding: 0, cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>{color}</span>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Comissão sobre Serviços (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={commissionPercent}
                    onChange={(e) => setCommissionPercent(Number(e.target.value))}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  Serviços que este profissional atende:
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {services.map((s) => {
                    const checked = selectedServices.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          if (checked) {
                            setSelectedServices(selectedServices.filter((id) => id !== s.id));
                          } else {
                            setSelectedServices([...selectedServices, s.id]);
                          }
                        }}
                        className="glass-card"
                        style={{
                          padding: '6px 14px',
                          fontSize: '0.82rem',
                          fontWeight: 500,
                          color: checked ? '#0B0F17' : 'var(--text-muted)',
                          background: checked ? 'var(--primary)' : 'var(--bg-input)',
                          border: checked ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                        }}
                      >
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Seção 2: Segurança, Acesso ao Sistema & Permissões Personalizadas */}
          <div
            className="glass-card"
            style={{
              padding: '18px',
              borderRadius: '12px',
              background: hasLogin ? 'rgba(229, 179, 56, 0.04)' : 'rgba(255, 255, 255, 0.02)',
              border: hasLogin ? '1px solid rgba(229, 179, 56, 0.3)' : '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: hasLogin ? 'rgba(229, 179, 56, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: hasLogin ? 'var(--primary)' : 'var(--text-dim)',
                  }}
                >
                  <Shield size={20} />
                </div>
                <div>
                  <h4 style={{ fontSize: '0.94rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    Acesso ao Sistema BarberFlow & Permissões
                  </h4>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Defina o papel, permissões personalizadas e credenciais de login para este membro.
                  </p>
                </div>
              </div>

              {/* Toggle Switch */}
              <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={hasLogin}
                  onChange={(e) => setHasLogin(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                />
                <div
                  style={{
                    width: '46px',
                    height: '26px',
                    borderRadius: '26px',
                    background: hasLogin ? 'var(--primary)' : 'rgba(255, 255, 255, 0.15)',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: '3px',
                      left: hasLogin ? '23px' : '3px',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: hasLogin ? '#0B0F17' : '#ffffff',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }}
                  />
                </div>
              </label>
            </div>

            {hasLogin && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '12px', borderTop: '1px solid rgba(229, 179, 56, 0.15)' }}>
                {/* 1. Escolha do Perfil / Preset de Permissões */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    1. Perfil de Acesso & Modelo de Permissões (1 clique):
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
                    {ROLE_PRESETS.map((p) => {
                      const isSelected = preset === p.id;
                      return (
                        <div
                          key={p.id}
                          onClick={() => applyPreset(p.id, true)}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            border: isSelected ? `1.5px solid ${p.badgeColor}` : '1px solid var(--border-color)',
                            background: isSelected ? p.badgeBg : 'var(--bg-input)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: isSelected ? p.badgeColor : 'var(--text-main)' }}>
                              {p.title}
                            </span>
                            {isSelected && <Check size={14} color={p.badgeColor} />}
                          </div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', lineHeight: '1.25' }}>
                            {p.description}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Título do Cargo / Função Personalizada */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Título do Cargo / Função exibido na equipe:
                  </label>
                  <input
                    type="text"
                    value={roleTitle}
                    placeholder="Ex: Gerente Geral, Recepcionista, Barbeiro Sênior..."
                    onChange={(e) => {
                      setRoleTitle(e.target.value);
                      if (preset !== 'CUSTOM') setPreset('CUSTOM');
                    }}
                  />
                </div>

                {/* 2. Credenciais de Acesso */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      E-mail de Login *
                    </label>
                    <input
                      type="email"
                      required={hasLogin}
                      placeholder="membro@exemplo.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {existingHasLogin ? 'Nova Senha (opcional)' : 'Senha de Acesso *'}
                      </label>
                      <button
                        type="button"
                        onClick={generateRandomPassword}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--primary)',
                          cursor: 'pointer',
                          fontSize: '0.74rem',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: 0,
                        }}
                      >
                        <Sparkles size={12} />
                        <span>Gerar Senha</span>
                      </button>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required={hasLogin && !existingHasLogin}
                        placeholder={existingHasLogin ? 'Deixe vazio para manter' : 'Mínimo 6 dígitos'}
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        style={{ paddingRight: '40px' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                          position: 'absolute',
                          right: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Envio de Convite por WhatsApp e E-mail */}
                <div
                  style={{
                    padding: '14px',
                    borderRadius: '10px',
                    background: 'rgba(37, 211, 102, 0.05)',
                    border: '1px solid rgba(37, 211, 102, 0.25)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '7px',
                          background: 'rgba(37, 211, 102, 0.15)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#25D366',
                        }}
                      >
                        <Send size={14} />
                      </div>
                      <div>
                        <h5 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
                          Enviar Convite com Dados de Acesso
                        </h5>
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          Compartilhe o link da plataforma, e-mail e senha diretamente com o colaborador.
                        </p>
                      </div>
                    </div>
                    {inviteCopied && (
                      <span style={{ fontSize: '0.74rem', color: '#10B981', fontWeight: 600 }}>
                        ✓ Mensagem copiada!
                      </span>
                    )}
                  </div>

                  {/* Prévia da mensagem formatada */}
                  <div
                    style={{
                      background: 'rgba(0, 0, 0, 0.25)',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                      lineHeight: '1.45',
                      whiteSpace: 'pre-line',
                      maxHeight: '110px',
                      overflowY: 'auto',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    {buildInviteText()}
                  </div>

                  {/* Botões de Ação */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => handleOpenWhatsApp()}
                      style={{
                        flex: '1 1 auto',
                        padding: '8px 14px',
                        borderRadius: '7px',
                        background: '#25D366',
                        color: '#072711',
                        fontWeight: 600,
                        fontSize: '0.8rem',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 8px rgba(37, 211, 102, 0.25)',
                      }}
                    >
                      <MessageSquare size={14} />
                      <span>Enviar por WhatsApp</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEmail()}
                      style={{
                        flex: '1 1 auto',
                        padding: '8px 14px',
                        borderRadius: '7px',
                        background: 'rgba(56, 189, 248, 0.15)',
                        color: '#38BDF8',
                        fontWeight: 600,
                        fontSize: '0.8rem',
                        border: '1px solid rgba(56, 189, 248, 0.3)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <Mail size={14} />
                      <span>Enviar por E-mail</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopyInvite()}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '7px',
                        background: 'rgba(255, 255, 255, 0.06)',
                        color: 'var(--text-main)',
                        fontSize: '0.8rem',
                        border: '1px solid var(--border-color)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <Copy size={14} />
                      <span>{inviteCopied ? 'Copiado!' : 'Copiar'}</span>
                    </button>

                    {editingId && (
                      <button
                        type="button"
                        disabled={sendingBotInvite}
                        onClick={() => handleSendBotInvite(editingId)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '7px',
                          background: 'rgba(229, 179, 56, 0.12)',
                          color: 'var(--primary)',
                          fontSize: '0.8rem',
                          fontWeight: 500,
                          border: '1px solid rgba(229, 179, 56, 0.25)',
                          cursor: sendingBotInvite ? 'not-allowed' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                        title="Disparar mensagem pelo WhatsApp oficial da barbearia"
                      >
                        <Send size={13} />
                        <span>{sendingBotInvite ? 'Disparando...' : 'Via Bot do Salão'}</span>
                      </button>
                    )}
                  </div>

                  {botInviteSuccess && (
                    <div
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        background: 'rgba(16, 185, 129, 0.15)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        color: '#10B981',
                        fontSize: '0.75rem',
                      }}
                    >
                      ✓ {botInviteSuccess}
                    </div>
                  )}
                </div>

                {/* 3. Menus e Telas Permitidos */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      2. Telas & Menus Permitidos no Painel Lateral:
                    </label>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                      Menus desmarcados ficam bloqueados e ocultos
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '8px' }}>
                    {AVAILABLE_MENUS.map((menu) => {
                      const isChecked = allowedMenus.includes(menu.key);
                      return (
                        <div
                          key={menu.key}
                          onClick={() => {
                            if (preset !== 'CUSTOM') setPreset('CUSTOM');
                            if (isChecked) {
                              setAllowedMenus(allowedMenus.filter((k) => k !== menu.key));
                            } else {
                              setAllowedMenus([...allowedMenus, menu.key]);
                            }
                          }}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            border: isChecked ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                            background: isChecked ? 'rgba(229, 179, 56, 0.08)' : 'var(--bg-input)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            transition: 'all 0.15s ease',
                            userSelect: 'none',
                          }}
                        >
                          <CustomCheckbox checked={isChecked} />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 }}>
                            <span style={{ fontSize: '0.84rem', fontWeight: 600, color: isChecked ? 'var(--text-main)' : 'var(--text-muted)' }}>
                              {menu.label}
                            </span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', lineHeight: 1.25 }}>
                              {menu.description}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 4. Permissões Granulares / Ações Detalhadas */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      3. Permissões Específicas de Ação & Segurança:
                    </label>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                      Ajuste fino personalizado
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                    {/* Agenda */}
                    <div className="glass-card" style={{ padding: '14px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '10px', border: '1px solid var(--border-color)', background: 'rgba(255, 255, 255, 0.02)' }}>
                      <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '6px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                        <CalendarIcon size={15} />
                        <span>Agenda & Atendimentos</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div
                          onClick={() => {
                            if (preset !== 'CUSTOM') setPreset('CUSTOM');
                            setCanViewAllAppointments(!canViewAllAppointments);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '12px',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            background: canViewAllAppointments ? 'rgba(229, 179, 56, 0.06)' : 'transparent',
                            transition: 'background 0.15s ease',
                            userSelect: 'none',
                          }}
                        >
                          <div style={{ marginTop: '2px' }}>
                            <CustomCheckbox checked={canViewAllAppointments} />
                          </div>
                          <span style={{ fontSize: '0.81rem', color: canViewAllAppointments ? 'var(--text-main)' : 'var(--text-muted)', lineHeight: '1.4', flex: 1 }}>
                            Ver a agenda de <strong>todos os barbeiros</strong> (se desmarcado, vê apenas a sua)
                          </span>
                        </div>

                        <div
                          onClick={() => {
                            if (preset !== 'CUSTOM') setPreset('CUSTOM');
                            setCanManageAppointments(!canManageAppointments);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '12px',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            background: canManageAppointments ? 'rgba(229, 179, 56, 0.06)' : 'transparent',
                            transition: 'background 0.15s ease',
                            userSelect: 'none',
                          }}
                        >
                          <div style={{ marginTop: '2px' }}>
                            <CustomCheckbox checked={canManageAppointments} />
                          </div>
                          <span style={{ fontSize: '0.81rem', color: canManageAppointments ? 'var(--text-main)' : 'var(--text-muted)', lineHeight: '1.4', flex: 1 }}>
                            Criar, reagendar e cancelar horários para <strong>outros profissionais</strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Financeiro */}
                    <div className="glass-card" style={{ padding: '14px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '10px', border: '1px solid var(--border-color)', background: 'rgba(255, 255, 255, 0.02)' }}>
                      <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#34D399', display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '6px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                        <DollarSign size={15} />
                        <span>Financeiro & Caixa</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div
                          onClick={() => {
                            if (preset !== 'CUSTOM') setPreset('CUSTOM');
                            setCanViewFinancials(!canViewFinancials);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '12px',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            background: canViewFinancials ? 'rgba(52, 211, 153, 0.06)' : 'transparent',
                            transition: 'background 0.15s ease',
                            userSelect: 'none',
                          }}
                        >
                          <div style={{ marginTop: '2px' }}>
                            <CustomCheckbox checked={canViewFinancials} />
                          </div>
                          <span style={{ fontSize: '0.81rem', color: canViewFinancials ? 'var(--text-main)' : 'var(--text-muted)', lineHeight: '1.4', flex: 1 }}>
                            Visualizar faturamento total e relatórios financeiros
                          </span>
                        </div>

                        <div
                          onClick={() => {
                            if (preset !== 'CUSTOM') setPreset('CUSTOM');
                            setCanManageFinancials(!canManageFinancials);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '12px',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            background: canManageFinancials ? 'rgba(52, 211, 153, 0.06)' : 'transparent',
                            transition: 'background 0.15s ease',
                            userSelect: 'none',
                          }}
                        >
                          <div style={{ marginTop: '2px' }}>
                            <CustomCheckbox checked={canManageFinancials} />
                          </div>
                          <span style={{ fontSize: '0.81rem', color: canManageFinancials ? 'var(--text-main)' : 'var(--text-muted)', lineHeight: '1.4', flex: 1 }}>
                            Lançar receitas, despesas manuais e fechar caixa
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Gestão de Clientes e Serviços */}
                    <div className="glass-card" style={{ padding: '14px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '10px', border: '1px solid var(--border-color)', background: 'rgba(255, 255, 255, 0.02)' }}>
                      <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#38BDF8', display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '6px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                        <UserCheck size={15} />
                        <span>Clientes & Serviços</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div
                          onClick={() => {
                            if (preset !== 'CUSTOM') setPreset('CUSTOM');
                            setCanManageCustomers(!canManageCustomers);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '12px',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            background: canManageCustomers ? 'rgba(56, 189, 248, 0.06)' : 'transparent',
                            transition: 'background 0.15s ease',
                            userSelect: 'none',
                          }}
                        >
                          <div style={{ marginTop: '2px' }}>
                            <CustomCheckbox checked={canManageCustomers} />
                          </div>
                          <span style={{ fontSize: '0.81rem', color: canManageCustomers ? 'var(--text-main)' : 'var(--text-muted)', lineHeight: '1.4', flex: 1 }}>
                            Cadastrar, editar ou remover dados de clientes
                          </span>
                        </div>

                        <div
                          onClick={() => {
                            if (preset !== 'CUSTOM') setPreset('CUSTOM');
                            setCanManageServices(!canManageServices);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '12px',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            background: canManageServices ? 'rgba(56, 189, 248, 0.06)' : 'transparent',
                            transition: 'background 0.15s ease',
                            userSelect: 'none',
                          }}
                        >
                          <div style={{ marginTop: '2px' }}>
                            <CustomCheckbox checked={canManageServices} />
                          </div>
                          <span style={{ fontSize: '0.81rem', color: canManageServices ? 'var(--text-main)' : 'var(--text-muted)', lineHeight: '1.4', flex: 1 }}>
                            Criar e alterar tabela de preços de serviços
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Equipe & Barbearia */}
                    <div className="glass-card" style={{ padding: '14px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '10px', border: '1px solid var(--border-color)', background: 'rgba(255, 255, 255, 0.02)' }}>
                      <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#F59E0B', display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '6px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                        <Settings size={15} />
                        <span>Administração & Sistema</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div
                          onClick={() => {
                            if (preset !== 'CUSTOM') setPreset('CUSTOM');
                            setCanManageTeam(!canManageTeam);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '12px',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            background: canManageTeam ? 'rgba(245, 158, 11, 0.06)' : 'transparent',
                            transition: 'background 0.15s ease',
                            userSelect: 'none',
                          }}
                        >
                          <div style={{ marginTop: '2px' }}>
                            <CustomCheckbox checked={canManageTeam} />
                          </div>
                          <span style={{ fontSize: '0.81rem', color: canManageTeam ? 'var(--text-main)' : 'var(--text-muted)', lineHeight: '1.4', flex: 1 }}>
                            Gerenciar outros membros da equipe e acessos
                          </span>
                        </div>

                        <div
                          onClick={() => {
                            if (preset !== 'CUSTOM') setPreset('CUSTOM');
                            setCanManageSettings(!canManageSettings);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '12px',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            background: canManageSettings ? 'rgba(245, 158, 11, 0.06)' : 'transparent',
                            transition: 'background 0.15s ease',
                            userSelect: 'none',
                          }}
                        >
                          <div style={{ marginTop: '2px' }}>
                            <CustomCheckbox checked={canManageSettings} />
                          </div>
                          <span style={{ fontSize: '0.81rem', color: canManageSettings ? 'var(--text-main)' : 'var(--text-muted)', lineHeight: '1.4', flex: 1 }}>
                            Alterar horários de funcionamento do salão
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
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
              {submitting ? 'Salvando...' : 'Salvar Membro da Equipe'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Remover ou Desativar Membro da Equipe */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => !isDeleting && setDeleteTarget(null)}
        title={deleteTarget?.isActive ? 'Remover Membro da Equipe' : 'Excluir Profissional'}
      >
        {deleteTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#EF4444',
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={22} />
              </div>
              <div>
                <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                  {deleteTarget.name}
                </h4>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: '1.45' }}>
                  {deleteTarget.isActive
                    ? 'Como você deseja prosseguir com a remoção deste membro da equipe?'
                    : 'Este profissional já está desativado da equipe. Você pode reativá-lo ou excluí-lo permanentemente do sistema.'}
                </p>
              </div>
            </div>

            {deleteTarget.isActive ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Opção 1: Desativar (Recomendado) */}
                <div
                  onClick={() => !isDeleting && executeDeactivate(deleteTarget.id)}
                  className="glass-card"
                  style={{
                    padding: '14px',
                    borderRadius: '10px',
                    cursor: isDeleting ? 'not-allowed' : 'pointer',
                    border: '1px solid rgba(229, 179, 56, 0.3)',
                    background: 'rgba(229, 179, 56, 0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--primary)' }}>
                      🟡 Desativar da Equipe (Recomendado)
                    </span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Preserva histórico</span>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                    Remove o profissional da tela ativa, da agenda pública e libera a vaga no seu plano, mantendo intactos todos os relatórios financeiros e atendimentos passados.
                  </p>
                </div>

                {/* Opção 2: Excluir Definitivamente */}
                <div
                  onClick={() => !isDeleting && executeForceDelete(deleteTarget.id)}
                  className="glass-card"
                  style={{
                    padding: '14px',
                    borderRadius: '10px',
                    cursor: isDeleting ? 'not-allowed' : 'pointer',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    background: 'rgba(239, 68, 68, 0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#EF4444' }}>
                      🔴 Excluir Definitivamente (Apagar Tudo)
                    </span>
                    <span style={{ fontSize: '0.74rem', color: '#EF4444' }}>Ação irreversível</span>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                    Apaga permanentemente o cadastro do profissional, credenciais de login e quaisquer agendamentos de teste vinculados a ele do banco de dados.
                  </p>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    color: '#F87171',
                    fontSize: '0.82rem',
                    lineHeight: '1.45',
                  }}
                >
                  Atenção: A exclusão permanente apagará todos os dados, serviços vinculados e agendamentos deste profissional. Esta ação não pode ser desfeita.
                </div>

                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => executeForceDelete(deleteTarget.id)}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: '#EF4444',
                    color: '#FFFFFF',
                    fontWeight: 600,
                    fontSize: '0.88rem',
                    border: 'none',
                    cursor: isDeleting ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <Trash2 size={16} />
                  <span>{isDeleting ? 'Excluindo permanentemente...' : 'Excluir Permanentemente do Sistema'}</span>
                </button>

                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => {
                    const t = deleteTarget;
                    setDeleteTarget(null);
                    handleReactivate(t);
                  }}
                  className="glass-card"
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    color: '#10B981',
                    fontWeight: 600,
                    fontSize: '0.88rem',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <RotateCcw size={16} />
                  <span>Reativar Membro na Equipe</span>
                </button>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '8px' }}>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
                className="glass-card"
                style={{ padding: '8px 16px', fontSize: '0.85rem', fontWeight: 500 }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
