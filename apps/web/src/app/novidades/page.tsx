'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  Zap,
  Flame,
  Palette,
  MessageSquare,
  CheckCircle2,
  Calendar,
  Clock,
  ArrowRight,
  Send,
  Lightbulb,
  ShieldCheck,
  Check,
  Filter,
  Tag,
  ExternalLink,
  ChevronRight,
  Heart,
  MessageCircle,
  Crown,
} from 'lucide-react';
import { Sidebar } from '../../components/Sidebar';
import { Header } from '../../components/Header';
import { Modal } from '../../components/Modal';
import { useAuth } from '../../lib/auth-context';
import { SYSTEM_VERSION } from '../../lib/constants';

type CategoryFilter = 'ALL' | 'NEW' | 'IMPROVEMENT' | 'DESIGN' | 'WHATSAPP';

interface ChangelogItem {
  id: string;
  version: string;
  date: string;
  title: string;
  category: 'NEW' | 'IMPROVEMENT' | 'DESIGN' | 'WHATSAPP';
  categoryLabel: string;
  badgeColor: string;
  badgeBg: string;
  summary: string;
  highlights: string[];
  impact: string;
}

const CHANGELOG_DATA: ChangelogItem[] = [
  {
    id: 'v4-1',
    version: 'v4.1',
    date: '09 de Novembro de 2026',
    title: 'Add-on Recebimentos Online & Cartão Recorrente (Direto na Conta do Salão) + Guia de Integrações',
    category: 'NEW',
    categoryLabel: 'Novo Add-on & Pagamentos',
    badgeColor: '#34D399',
    badgeBg: 'rgba(16, 185, 129, 0.16)',
    summary:
      'Agora cada barbearia pode conectar sua própria conta do Mercado Pago para vender planos mensais do Clube de Assinatura VIP diretamente na Vitrine Pública e pelo Bot do WhatsApp! O cliente assina com Cartão de Crédito (podendo escolher entre Renovação Automática Mensal ou Manual) ou PIX Instantâneo, 100% do valor vai direto para a conta do dono do salão e a assinatura VIP é liberada na mesma hora.',
    highlights: [
      'Novo Add-on "Recebimentos Online & Cartão Recorrente" (onlinePayments): Disponível no Super Admin e no catálogo de Módulos Extras (/planos) para ativação sob demanda ou inclusão nos planos.',
      'Nova Aba "Recebimentos Online & Integrações" em Configurações (/settings): Inclui um Passo a Passo completo e ilustrado em 4 etapas ensinando como criar a aplicação no Mercado Pago Developers, copiar a Public Key e Access Token de Produção, configurar o Webhook com 1 clique e testar a conexão em tempo real.',
      'Checkout Transparente do Clube VIP na Vitrine (/[slug]): Clientes podem clicar em "Assinar Online (Cartão ou PIX)", escolher entre Renovação Automática (Auto-Renew) ou Manual no cartão de crédito, ou pagar via QR Code PIX com confirmação automática na tela.',
      'Ativação Automática + Financeiro + WhatsApp: Assim que o pagamento é aprovado na conta do salão, o BarberFlow ativa/renova os +30 dias do assinante no Clube VIP, lança a receita automaticamente no Financeiro (/finance) e envia confirmação pelo WhatsApp.',
      'Sugestão Inteligente de Planos Mensais no Bot WhatsApp: O Bot agora apresenta a Opção 6 (Planos Mensais Clube VIP), sugere planos durante o agendamento com cálculo de economia e envia o link direto para assinatura online.',
      'Redesign do Painel Clube VIP (/clube): Novos botões de alto contraste, templates rápidos de planos em 1 clique e modais responsivos que se ajustam perfeitamente a qualquer tamanho de tela.',
    ],
    impact: 'Automatiza 100% da venda e cobrança dos planos mensais do Clube VIP com o dinheiro caindo direto na conta bancária do dono da barbearia.',
  },
  {
    id: 'v4-0',
    version: 'v4.0',
    date: '06 de Novembro de 2026',
    title: 'Clube de Assinatura VIP da Barbearia (MRR Recorrente & Fidelização Máxima)',
    category: 'NEW',
    categoryLabel: 'RoadMap Completo (Fase 6)',
    badgeColor: '#E5B338',
    badgeBg: 'rgba(229, 179, 56, 0.15)',
    summary:
      'Conclusão triunfal do RoadMap Oficial do BarberFlow! O Clube de Assinatura VIP permite que as barbearias criem planos mensais por assinatura recorrente (ex: Corte Ilimitado por R$ 119/mês ou 4 Atendimentos por R$ 99/mês), gerando previsibilidade financeira garantida (MRR), validação em tempo real e deduções automatizadas.',
    highlights: [
      'Criação & Gestão de Planos VIP: Planos customizáveis com preço mensal, serviços inclusos (corte, barba, sobrancelha, etc.), limite de utilizações (ilimitado ou cota mensal) e dias válidos na semana.',
      'Controle Total de Assinantes (/clube): Painel de gestão da barbearia com KPIs em tempo real (Assinantes Ativos, MRR do Clube, Cortes Prestados no Mês e Assinaturas Vencendo em 7 Dias).',
      'Abatimento & Auditoria Automática de Usos: Ao concluir um agendamento na barbearia, o BarberFlow identifica automaticamente se o cliente é assinante VIP, abate 1 uso do ciclo mensal, emite comprovante no WhatsApp e registra log auditável.',
      'Vitrine Pública & Assinatura Facilitada (/[slug]): Apresentação sofisticada dos planos do clube na página pública da barbearia com conversão direta para adesão no WhatsApp.',
      'Renovação Inteligente de Ciclo: Botão de renovação manual em 1 clique (+30 dias e zeramento de contador de usos) com controle de formas de pagamento (PIX, Cartão, Dinheiro).',
      'Totalmente Integrado ao Super Admin: Gestão de permissões de plano SaaS e add-on dedicado com catálogo de preços e permissões granulares.',
    ],
    impact: 'Transforma barbearias em negócios de receita recorrente previsível com clientes fiéis e faturamento mensal garantido.',
  },
  {
    id: 'v3-5',
    version: 'v3.5',
    date: '06 de Novembro de 2026',
    title: 'Recuperação Automática de Clientes Sumidos & Aniversariantes no WhatsApp com Proteção Anti-Ban',
    category: 'NEW',
    categoryLabel: 'Fase 5 RoadMap',
    badgeColor: '#F59E0B',
    badgeBg: 'rgba(245, 158, 11, 0.15)',
    summary:
      'Lançamento da Fase 5 do RoadMap Oficial: Robôs inteligentes e autônomos para alavancar a receita das barbearias no piloto automático. O sistema identifica clientes ausentes há semanas e aniversariantes do dia, disparando mensagens acolhedoras e ofertas exclusivas no WhatsApp com filtros rígidos anti-ban, painel de métricas de conversão e histórico auditável.',
    highlights: [
      'Robô 1 — Resgate de Clientes Inativos: Varredura contínua identificando clientes que cortavam com frequência mas estão há 20, 25, 30 ou 45 dias sem voltar e sem horário futuro marcado, com convite direto no WhatsApp.',
      'Robô 2 — Parabéns de Aniversário: Identificação de aniversariantes do dia e envio de felicitações comemorativas matinais acompanhadas de desconto ou mimo configurável pelo salão.',
      'Filtros Inteligentes Anti-Ban: Janela restrita a horário comercial (09h às 19h), espaçamento aleatório entre envios, cota máxima diária e bloqueio de reenvio para o mesmo cliente em menos de 30 dias.',
      'Painel de Gestão da Barbearia (/marketing): Dashboard com KPIs de ROI (clientes sumidos identificados, aniversariantes de hoje, mensagens enviadas e clientes recuperados que voltaram a agendar).',
      'Disparos Manuais & Teste em 1 Clique: O barbeiro pode testar o texto no próprio celular, enviar mensagens personalizadas individuais ou disparar lotes com um clique.',
      'Data de Nascimento no Agendamento Web & Cadastro: Campo opcional de aniversário integrado à vitrine online (/[slug]/agendar) e à ficha de clientes (/customers).',
    ],
    impact: 'Aumento imediato do faturamento das barbearias com retorno ativo de clientes esquecidos e relacionamento humanizado.',
  },

  {
    id: 'v3-4',
    version: 'v3.4',
    date: '06 de Novembro de 2026',
    title: 'Cartão Fidelidade Digital Automático: Acúmulo por Agendamento, Alertas WhatsApp e Vitrine Interativa',
    category: 'NEW',
    categoryLabel: 'Fase 4 RoadMap',
    badgeColor: '#E5B338',
    badgeBg: 'rgba(229, 179, 56, 0.15)',
    summary:
      'Lançamento da Fase 4 do RoadMap Oficial: Sistema completo de Cartão Fidelidade Digital 100% automatizado para barbearias. A cada corte ou atendimento concluído na agenda, o cliente ganha automaticamente +1 selo e recebe comprovante pelo WhatsApp. Ao completar o ciclo (ex: 10 selos), ganha prêmio (ex: 1 Corte Grátis). Inclui painel de gestão em /fidelidade, consulta pública em tempo real na vitrine (/[slug]), ajuste manual e módulo de permissão Add-on no Super Admin.',
    highlights: [
      'Acúmulo 100% Automático via Agenda: Ao alterar o status de um agendamento para Concluído (COMPLETED), o sistema credita o selo na hora e dispara notificação comemorativa no WhatsApp.',
      'Ciclos & Recompensas: Mapeamento de ciclos conquistados e saldo de recompensas prontas para resgate com zero perda de histórico.',
      'Painel de Gestão da Barbearia (/fidelidade): Dashboard com KPIs (clientes fidelizados, selos concedidos, prêmios resgatados), busca com debounce, filtro de clientes prontos para resgate, botões de +1/-1 selo e histórico auditável.',
      'Resgate de Prêmios com 1 Clique: O barbeiro valida o resgate com confirmação interativa e o sistema registra a transação com baixa no saldo do cliente.',
      'Consulta Pública na Vitrine (/[slug]): Seção interativa onde o cliente digita seu telefone e visualiza seu cartão digital estilizado com selos dourados, barra de progresso e prêmios liberados.',
      'Módulo Add-on no Super Admin: Permissão loyalty configurável nos planos Starter, Pro e Premium e catálogo de add-ons com precificação mensal flexível.',
    ],
    impact: 'Aumento expressivo na retenção e frequência de retorno dos clientes das barbearias com engajamento automático.',
  },

  {
    id: 'v3-3',
    version: 'v3.3',
    date: '06 de Novembro de 2026',
    title: 'Régua Automática de Cobrança da Assinatura: Lembretes D-3, D0 e D+2 com PIX Automático',
    category: 'NEW',
    categoryLabel: 'Fase 3 RoadMap',
    badgeColor: '#E5B338',
    badgeBg: 'rgba(229, 179, 56, 0.15)',
    summary:
      'Lançamento da Fase 3 do RoadMap Oficial: Motor completo de Régua Automática de Cobrança para reduzir a inadimplência do SaaS a zero. Notificações preventivas 3 dias antes (D-3), geração automática de PIX Copia e Cola no vencimento (D0), aviso de carência urgente (D+2), e-mails corporativos estilizados via SMTP e painel de controle completo no Super Admin com execução em tempo real.',
    highlights: [
      'Agendador Automático no Servidor: Varredura diária inteligente a cada 1h mapeando todas as assinaturas próximas ao vencimento sem duplicar disparos no mesmo dia.',
      'Estágio D-3 (Aviso Preventivo): Envio de e-mail lembrando o salão 3 dias antes do vencimento com sugestão de economia em planos Anuais e Semestrais.',
      'Estágio D0 (Dia do Vencimento + PIX Auto): Geração automática de cobrança PIX no Mercado Pago com código Copia e Cola formatado diretamente no corpo do e-mail para pagamento instantâneo.',
      'Estágio D+2 (Aviso Urgente de Carência): Cobrança de regularização para contas vencidas há 2 dias antes da suspensão da vitrine e agendamentos.',
      'Painel Super Admin Dedicado: KPIs em tempo real (salões em D-3, D0, D+2), toggles de canais/estágios, botão de disparo sob demanda e histórico completo de disparos.',
      'Banners In-App no Painel do Salão: Avisos contextuais com botão direto para regularização em 1 clique.',
    ],
    impact: 'Redução drástica da inadimplência e automação 100% autônoma das renovações de assinaturas.',
  },

  {
    id: 'v3-2',
    version: 'v3.2',
    date: '06 de Novembro de 2026',
    title: 'Planos Semestrais e Anuais no Checkout, Descontos Progressivos e Parcelamento no Cartão',
    category: 'NEW',
    categoryLabel: 'Fase 2 RoadMap',
    badgeColor: '#10B981',
    badgeBg: 'rgba(16, 185, 129, 0.15)',
    summary:
      'Lançamento da Fase 2 do RoadMap Estratégico com suporte completo a ciclos Semestrais (180 dias) e Anuais (365 dias) no checkout de Planos (/planos), descontos progressivos configuráveis pelo Super Admin (/admin), parcelamento em até 12x no cartão de crédito via Mercado Pago e renovação inteligente com extensão de período.',
    highlights: [
      'Seletor de Ciclos na Tabela de Planos: Alternância dinâmica entre Mensal, Semestral (10% OFF) e Anual (20% OFF / 2 meses grátis) com exibição da economia anual e valor mensal equivalente.',
      'Parcelamento no Cartão de Crédito: Opção de parcelamento sem juros liberada no checkout (até 6x no Semestral e até 12x no Anual) com valor das parcelas calculado na hora.',
      'Renovação Inteligente de Assinatura: Ao aprovar o pagamento, o sistema adiciona automaticamente +180 ou +365 dias de acesso mantendo a continuidade do plano sem zerar dias restantes.',
      'Gestão Centralizada no Super Admin: Aba Planos & Vitrine com painel para ativar/desativar ciclos, ajustar a % de desconto e limitar o número de parcelas permitidas.',
      'Combinação com Cupons de Desconto: O salão pode acumular o desconto do ciclo com cupons promocionais criados no Super Admin.',
    ],
    impact: 'Antecipação de até 12 meses de receita SaaS no caixa com incentivo financeiro para as barbearias economizarem.',
  },
  {
    id: 'v3-1',
    version: 'v3.1',
    date: '05 de Novembro de 2026',
    title: 'Sistema de Cupons de Desconto, Gestão de Add-ons no Super Admin e Blindagem Mercado Pago',
    category: 'NEW',
    categoryLabel: 'Fase 1 RoadMap',
    badgeColor: '#10B981',
    badgeBg: 'rgba(16, 185, 129, 0.15)',
    summary:
      'Lançamento da Fase 1 do RoadMap Estratégico com motor completo de Cupons Promocionais no Super Admin (/admin), gestão dinâmica de módulos Add-on e precificação, aplicação de cupons com desconto instantâneo no checkout de Planos (/planos) e Módulo Fiscal NFS-e (/nfse), e blindagem de segurança para produção com Mercado Pago.',
    highlights: [
      'Gestão de Cupons no Super Admin: Crie cupons promocionais em porcentagem (%) ou valor fixo (R$), defina limite de usos, data de validade, aplicação (Todos, Planos ou Add-ons) e pause/ative a qualquer momento.',
      'Checkout com Desconto em Tempo Real: Campo dedicado no checkout de Planos e no Módulo Fiscal NFS-e com validação instantânea, valor original riscado e economia destacada.',
      'Gestão de Add-ons pelo Super Admin: Aba exclusiva para gerenciar quais módulos são vendidos separadamente, seus preços mensais e ativação automática por plano.',
      'Blindagem Mercado Pago em Produção: Sanitização e validação de CPF/CNPJ, anti-fraude aprimorado, webhook com idempotência e suporte a cartão de crédito/PIX.',
      'Controle de Uso Automático: Incremento atômico de uso do cupom assim que o pagamento é aprovado via webhook ou polling.',
    ],
    impact: 'Novas ferramentas de crescimento comercial e conversão de salões parceiros com segurança máxima nas transações.',
  },
  {
    id: 'v3-0',
    version: 'v3.0',
    date: '05 de Novembro de 2026',
    title: 'Módulo de Emissão de Nota Fiscal de Serviços Eletrônica (NFS-e Nacional), Lei do Salão-Parceiro e Certificado Digital A1',
    category: 'NEW',
    categoryLabel: 'Grande Lançamento',
    badgeColor: '#10B981',
    badgeBg: 'rgba(16, 185, 129, 0.15)',
    summary:
      'Lançamento do Módulo Fiscal Integrado de Emissão de NFS-e (/nfse) no Padrão Nacional (Sefin Nacional / nfse.gov.br) com Certificado Digital e-CNPJ A1 (.pfx), cálculo automático de abatimento da Lei do Salão-Parceiro (Lei nº 13.352/2016), DANFSE oficial para impressão/PDF e envio automático no WhatsApp do cliente. Incluso no Plano Premium ou contratável como Módulo Add-on avulso.',
    highlights: [
      'Emissão Direta no Padrão Nacional NFS-e (Custo Zero de API): Transmissão segura via mTLS com o Certificado Digital A1 (.pfx) do próprio salão diretamente para a Sefin Nacional (nfse.gov.br), com suporte a Homologação e Produção.',
      'Lei do Salão-Parceiro (Lei nº 13.352/2016): Dedução automática da cota-parte (comissão %) do barbeiro parceiro na base de cálculo do ISS, reduzindo legalmente a carga tributária da barbearia.',
      'Emissão em 1 Clique ou 100% Automática: Gere a NFS-e a partir de qualquer agendamento concluído na agenda, emita notas avulsas ou ative a emissão automática assim que o corte for finalizado.',
      'DANFSE Oficial & Envio pelo Bot WhatsApp: Documento Auxiliar da NFS-e pronto para visualização, impressão e PDF, com disparo automático do link oficial no WhatsApp do cliente.',
      'Modelo Comercial Híbrido: Incluso gratuitamente para assinantes do Plano Premium e disponível para contratação avulsa (Add-on mensal via PIX ou Cartão) para salões nos planos Starter e Pro.',
    ],
    impact: 'Conformidade fiscal automatizada com economia tributária real pela Lei do Salão-Parceiro e zero custo de intermediação por nota emitida.',
  },
  {
    id: 'v2-9',
    version: 'v2.9',
    date: '28 de Outubro de 2026',
    title: 'Nova Central de Relatórios: Pesquisas de Satisfação (NPS), Produtividade de Cortes por Barbeiro e Agendamentos & Cancelamentos',
    category: 'NEW',
    categoryLabel: 'Grande Lançamento',
    badgeColor: '#E5B338',
    badgeBg: 'rgba(229, 179, 56, 0.15)',
    summary:
      'Lançamento oficial da nova aba de Relatórios (/reports) no menu lateral com inteligência analítica completa: métricas de NPS e satisfação com mural de depoimentos, ranking de produtividade e faturamento por barbeiro com ticket médio e relatório analítico de agendamentos com taxas de cancelamento e no-show.',
    highlights: [
      'Relatório de Pesquisa de Satisfação: Média geral, CSAT (% positivo), NPS Score (-100 a +100), distribuição de notas de 1 a 5 com emojis e barras visuais, comparativo de canal (Atendente vs Barbeiro), ranking de satisfação por profissional e mural completo de sugestões/depoimentos textuais.',
      'Relatório de Quantidade de Cortes por Barbeiro: Ranking de produtividade com pódios (#1 Ouro, #2 Prata, #3 Bronze), total de cortes concluídos, faturamento bruto em R$, ticket médio individual, percentual de participação no salão, nota média e serviços mais executados por cada barbeiro.',
      'Relatório de Agendamentos & Cancelamentos: Acompanhamento de agendados, confirmados, realizados, cancelados e faltas (No-Show), taxa de conversão vs cancelamento, impacto financeiro (receita realizada vs receita perdida), distribuição por origem (Bot WhatsApp, Vitrine Online ou Painel) e tabela detalhada com motivos de cancelamento.',
      'Filtros Globais Inteligentes: Seleção rápida por presets (Hoje, 7 Dias, 30 Dias, Este Mês, Mês Anterior, Ano Atual), intervalo de datas customizado e filtro por profissional.',
      'Exportação em CSV: Baixe relatórios completos em formato planilha CSV com um único clique para auditoria e controle externo.',
    ],
    impact: 'Visão executiva 360° para donos de barbearias e gestores avaliarem a qualidade do atendimento, faturamento por colaborador e gargalos de cancelamento.',
  },
  {
    id: 'v2-8',
    version: 'v2.8',
    date: '27 de Outubro de 2026',
    title: 'Pesquisas de Satisfação em 2 Níveis (Atendimento & Pós-Corte), Botão Encerrar Chat, Histórico da Data Atual e Menu Atendente',
    category: 'WHATSAPP',
    categoryLabel: 'Novo Recurso',
    badgeColor: '#E5B338',
    badgeBg: 'rgba(229, 179, 56, 0.15)',
    summary:
      'Implementação completa das pesquisas de satisfação em 2 níveis (nota de 1 a 5 + sugestões/elogios) para atendimento humano e pós-corte concluído, botão de encerramento rápido de chat que libera a conversa imediatamente para o robô, histórico focado na data atual ao transferir para o operador e opção 5 no menu do bot para falar diretamente com o atendente.',
    highlights: [
      'Pesquisa de Satisfação de Atendimento Humano (2 Níveis): ao encerrar o chat, a conversa é imediatamente liberada para o assistente virtual e o cliente recebe a avaliação: Nível 1 com nota de 1 a 5 (com emojis de muito ruim a excelente) e Nível 2 para sugestão de melhoria ou detalhes.',
      'Pesquisa de Satisfação Pós-Corte/Agendamento: assim que o barbeiro ou profissional conclui um agendamento (status CONCLUÍDO), o cliente recebe automaticamente no WhatsApp uma pesquisa para avaliar o corte e o profissional.',
      'Controle Individual de Ativação e Templates na Aba de Bot (/whatsapp): agora você pode ativar ou desativar individualmente a pesquisa de atendimento humano e a pesquisa pós-corte do barbeiro, além de editar e personalizar o template de mensagem de cada uma com tags dinâmicas ({nome}, {atendente}, {profissional}, {servico}, {salao}).',
      'Timeout Inteligente de 1 Hora: se o cliente não responder à pesquisa de satisfação dentro de 1 hora, a conversa é finalizada e liberada automaticamente para o menu inicial com opções de agendamento.',
      'Botão "Encerrar Atendimento" no Chat (/chat): botão dedicado com confirmação no cabeçalho do chat ativo para finalizar o atendimento humano, pausar o operador e enviar a pesquisa.',
      'Histórico de Atendimento Focado na Data Atual: ao abrir a conversa transferida no painel, o sistema traz prioritariamente as mensagens de hoje (data atual), com botão opcional para expandir o histórico de dias anteriores caso necessário.',
      'Opção "5 - Falar com Atendente" no Menu do WhatsApp: nova opção no menu principal e reconhecimento automático de comandos textuais ("atendente", "falar com atendente", "humano", "suporte"), direcionando instantaneamente para a equipe.',
      'Mensagens de Sistema Estilizadas no Chat: avisos de transferência e encerramento com design em pílula elegante no fluxo da conversa.',
    ],
    impact: 'Controle de qualidade e métricas reais de satisfação do cliente em cada corte e suporte, customização total de templates de pesquisa e transição perfeita entre robô e humano.',
  },
  {
    id: 'v2-7',
    version: 'v2.7',
    date: '27 de Outubro de 2026',
    title: 'Notificações em Tempo Real (Som + Toast + Desktop), Chat ao Vivo com WhatsApp, Transferência para Atendente e Status Atrasado',
    category: 'WHATSAPP',
    categoryLabel: 'Grande Lançamento',
    badgeColor: '#10B981',
    badgeBg: 'rgba(16, 185, 129, 0.15)',
    summary:
      'Lançamento da nova Central de Atendimento e Chat ao Vivo (/chat) com sistema completo de Notificações em Tempo Real (chime sonoro, toast flutuante, notificação desktop do navegador, badge no menu lateral e sino no cabeçalho) sempre que o salão recebe mensagens no WhatsApp e não está com o chat aberto. Além disso, adicionamos transferência para atendente humano, identificação automática do operador, cruzamento inteligente de clientes, status Atrasado com avisos internos e bloqueio de horários passados.',
    highlights: [
      'Layout Responsivo Anti-Quebras para Monitores Menores: redesenho completo com variáveis dinâmicas de largura (--sidebar-width, --chat-sidebar-width) e proteção contra quebra de textos para notebooks e monitores compactos (1366x768, 1280x800 ou escala 125%/150%), eliminando qualquer colisão de fontes e quebras de linha indesejadas no topo, no menu e no chat.',
      'Notificações em Tempo Real (Som + Toast + Desktop): sempre que o salão recebe mensagem no WhatsApp com a aba de atendimento fechada ou minimizada, o sistema toca um aviso sonoro (chime sintetizado via Web Audio API), exibe um alerta flutuante luxuoso com atalho direto e envia notificação nativa na área de trabalho do computador.',
      'Badges Dinâmicos no Menu Lateral e Sino (Header): o item "Atendimento / Chat" da barra lateral e o sino de notificações no topo exibem em tempo real o número exato de mensagens não lidas, com dropdown detalhado com nome do cliente, prévia da mensagem e clique direto para abrir.',
      'Identificação Automática do Atendente: ao responder um cliente pelo painel, o sistema inclui automaticamente o nome do atendente na mensagem do WhatsApp (ex: *Guilherme Jorge:*\nopa), garantindo total clareza de quem está prestando o atendimento.',
      'Cruzamento Inteligente com Cadastro de Clientes: o Chat ao Vivo agora cruza em tempo real os números do WhatsApp com a aba Clientes (/customers), trazendo sempre o nome oficial do cliente ao invés do telefone.',
      'Filtros do Chat em Grid 2x2 (Zero Scrollbar): redesenho dos botões de filtro (Todas, Não Lidas, Atendente, Robô) em grade compacta sem barra de rolagem horizontal.',
      'Aba de Atendimento / Chat ao Vivo (/chat): visualize conversas do WhatsApp em tempo real, leia mensagens e envie respostas instantâneas para os clientes pelo painel.',
      'Transferência para Atendente Humano: pause o robô com 1 clique para falar diretamente com o cliente sem mensagens automáticas interferindo, e devolva para o bot quando terminar.',
      'Opção "Falar com Atendente" no Bot: clientes que escolhem a opção 5 no WhatsApp são automaticamente transferidos para a fila de atendimento humano.',
      'Novo Status "Atrasado" (DELAYED): detecção automática de atendimentos que ultrapassaram o horário de término previsto sem conclusão pelo barbeiro ou salão.',
      'Sino de Notificações Internas no Topo (Header): alerta visual em tempo real mostrando cortes com atraso para a equipe do salão.',
      'Notificação de Atraso ao Cliente: botão rápido no agendamento para disparar aviso amigável no WhatsApp do cliente com link para resposta imediata.',
      'Bloqueio Universal de Horários e Datas Passadas: o sistema agora impede qualquer agendamento em datas ou horários que já passaram hoje, na agenda, na vitrine e no bot.',
      'Cards da Agenda Otimizados: nome do cliente em destaque absoluto na primeira linha do card, eliminando cortes de texto e garantindo leitura nítida em qualquer resolução.',
    ],
    impact: 'Atendimento humanizado e imediato no WhatsApp sem sair do BarberFlow, pontualidade máxima no salão com alertas de atraso e experiência impecável na agenda.',
  },
  {
    id: 'v2-6',
    version: 'v2.6',
    date: '24 de Outubro de 2026',
    title: 'Integração Mercado Pago (Pix e Cartão), Alertas de Trial e Domínio Próprio DNS',
    category: 'NEW',
    categoryLabel: 'Grande Lançamento',
    badgeColor: '#E5B338',
    badgeBg: 'rgba(229, 179, 56, 0.15)',
    summary:
      'Sistema completo de pagamentos e assinaturas com Mercado Pago (Pix Instantâneo e Cartão de Crédito), menu de configurações e instruções no Super Admin, alertas proeminentes de término de trial (14 dias) e renovação de planos, além de suporte a Domínio Próprio para o plano Premium e popups luxuosos.',
    highlights: [
      'Integração Oficial com Mercado Pago: receba o pagamento dos seus clientes nos 3 planos (Starter, Pro, Premium) via Pix Copia e Cola / QR Code com liberação em tempo real ou Cartão de Crédito.',
      'Menu de Integrações no Super Admin (/admin): aba exclusiva com tutorial passo a passo para obter credenciais no portal Mercado Pago Developers, webhook com cópia em 1 clique e botão de teste de conexão.',
      'Alertas Inteligentes de Fim de Trial (14 dias): banners no Header e na Barra Lateral avisando o término iminente do período de teste gratuito com chamada imediata para efetivar a assinatura por Pix ou Cartão.',
      'Avisos e Contagem Regressiva de Renovação: o cliente acompanha com clareza os dias restantes para renovar sua assinatura e evita qualquer pausa no atendimento da sua barbearia.',
      'Histórico de Faturas & Pagamentos: extrato transparente com método utilizado (Pix / Cartão), data, valor em R$ e status da transação.',
      'Domínio Próprio & DNS (Exclusivo Premium): conecte o endereço oficial da sua barbearia diretamente à vitrine web com verificação de propagação em tempo real.',
      'Modificação de Planos no Painel Admin: o Super Admin pode alternar planos de qualquer salão e gerenciar permissões na hora.',
    ],
    impact: 'Monetização 100% automatizada para o dono da plataforma via Mercado Pago, zero fricção de cobrança dos clientes e transparência total nas datas de renovação e fim de trial.',
  },
  {
    id: 'v2-5',
    version: 'v2.5',
    date: '23 de Outubro de 2026',
    title: 'Barra Lateral Fixa (Sticky) & Posicionamento Ancorado do Rodapé',
    category: 'DESIGN',
    categoryLabel: 'Design & UX',
    badgeColor: '#8B5CF6',
    badgeBg: 'rgba(139, 92, 246, 0.15)',
    summary:
      'Aprimoramento estrutural do Menu Lateral (Sidebar): fixação 100vh na tela com rolagem independente e ancoragem permanente do card de plano e versão no rodapé.',
    highlights: [
      'Sidebar com fixação sticky (100vh): o menu permanece fixo na lateral da tela enquanto o conteúdo da página rola livremente, sem esticar.',
      'Card de plano e limites ancorado de forma permanente no rodapé da barra lateral, sem flutuar para cima ou para baixo conforme o tamanho do conteúdo.',
      'Exibição da versão ativa do sistema (v2.5) diretamente no rodapé da Sidebar e na Central de Novidades.',
      'Rolagem interna suave no menu lateral com suporte responsivo a qualquer resolução.',
      'Novas páginas de Novidades (/novidades) e Comparativo de Planos (/planos) integradas à navegação.',
    ],
    impact: 'Navegação 100% estável e consistente em todas as telas do painel, eliminando deslocamentos indesejados da barra lateral.',
  },
  {
    id: 'v2-4',
    version: 'v2.4',
    date: '23 de Outubro de 2026',
    title: 'Fotos de Profissionais na Vitrine & Remoção de Spinners',
    category: 'NEW',
    categoryLabel: 'Novo Recurso',
    badgeColor: '#10B981',
    badgeBg: 'rgba(16, 185, 129, 0.15)',
    summary:
      'Agora cada barbeiro ou membro da equipe pode ter sua foto de perfil personalizada cadastrada, refletindo imediatamente na vitrine pública e no fluxo de agendamento.',
    highlights: [
      'Upload de fotos (JPG, PNG, WebP até 5MB) no cadastro e edição de profissionais com preview instantâneo.',
      'Exibição na vitrine online em "Nossa Equipe de Barbeiros" com borda iluminada na cor personalizada do profissional.',
      'Foto do barbeiro visível no Passo 2 (Seleção) e Passo 4 (Resumo) do agendamento web do cliente.',
      'Fallback inteligente para badge com inicial do nome em tons luxuosos quando não houver foto cadastrada.',
      'Eliminação completa das setas brancas nativas nos campos de valor numérico, garantindo visual dark 100% harmonioso.',
    ],
    impact: 'Aumenta a confiança do cliente final ao escolher com quem deseja ser atendido e personaliza a vitrine da sua marca.',
  },
  {
    id: 'v2-3',
    version: 'v2.3',
    date: '22 de Outubro de 2026',
    title: 'Promoções por Tempo Limitado & Dias da Semana Recorrentes',
    category: 'NEW',
    categoryLabel: 'Novo Recurso',
    badgeColor: '#E5B338',
    badgeBg: 'rgba(229, 179, 56, 0.15)',
    summary:
      'Crie campanhas promocionais com desconto automático, expiração por cronômetro e dias específicos da semana recorrentes (ex: Quarta-feira Maluca).',
    highlights: [
      'Configuração de preço promocional com percentual de desconto calculado em tempo real.',
      'Promoções recorrentes por dia da semana (ex: desconto ativo somente às quartas e quintas-feiras).',
      'Data e horário limite de validade: após expirar, o serviço retorna automaticamente ao valor padrão sem intervenção manual.',
      'Cálculo e aplicação automática do preço correto na vitrine pública e no agendamento online.',
      'Disparo de campanhas promocionais prontas para envio via WhatsApp ou E-mail com link direto de agendamento.',
    ],
    impact: 'Aumente o movimento em dias tradicionalmente mais lentos da semana com incentivos programados.',
  },
  {
    id: 'v2-2',
    version: 'v2.2',
    date: '21 de Outubro de 2026',
    title: 'Seletores de Data & Hora Luxury Gold Customizados',
    category: 'DESIGN',
    categoryLabel: 'Design & UX',
    badgeColor: '#8B5CF6',
    badgeBg: 'rgba(139, 92, 246, 0.15)',
    summary:
      'Substituição de todos os popovers nativos do navegador por componentes exclusivos no tema Dark & Gold Luxury do BarberFlow.',
    highlights: [
      'Novo DatePicker interativo com suporte a atalhos rápidos ("Hoje", "Amanhã", "Fim do Mês").',
      'TimePicker moderno com botões de hora cheia, seleção rápida de 15 em 15 minutos e digitação livre.',
      'Renderização via Portal Flutuante que impede cortes de layout dentro de modais e tabelas.',
      'Suporte completo a telas de toque e dispositivos móveis.',
    ],
    impact: 'Experiência fluida, moderna e sem quebras visuais em nenhum dispositivo ou navegador.',
  },
  {
    id: 'v2-1',
    version: 'v2.1',
    date: '20 de Outubro de 2026',
    title: 'Gestão de Equipe Avançada & Permissões Granulares',
    category: 'IMPROVEMENT',
    categoryLabel: 'Melhoria',
    badgeColor: '#06B6D4',
    badgeBg: 'rgba(6, 182, 212, 0.15)',
    summary:
      'Diferenciação clara entre profissionais que atendem na cadeira e membros administrativos, com perfis de permissão pré-definidos e senhas provisórias.',
    highlights: [
      'Perfis prontos: Administrador/Gerente, Recepção/Atendimento, Barbeiro, Financeiro/Caixa e Personalizado.',
      'Geração de senha provisória de alta segurança com obrigatoriedade de redefinição no primeiro acesso.',
      'Disparo de credenciais e link do painel diretamente pelo Bot de WhatsApp do salão com um clique.',
      'Separação entre quem realiza cortes (comissão e agenda) e apoio administrativo (sem agenda de cadeira).',
      'Controle por tela: restrinja acesso a faturamento, comissões ou configurações do salão.',
    ],
    impact: 'Segurança absoluta para os donos de barbearia ao delegar acessos para recepcionistas e barbeiros.',
  },
  {
    id: 'v2-0',
    version: 'v2.0',
    date: '19 de Outubro de 2026',
    title: 'BarberFlow WhatsApp Engine com Conexão Instantânea',
    category: 'WHATSAPP',
    categoryLabel: 'WhatsApp & Automação',
    badgeColor: '#10B981',
    badgeBg: 'rgba(16, 185, 129, 0.15)',
    summary:
      'Motor próprio de WhatsApp integrado via Baileys com conexão por QR Code em segundos sem intermediários.',
    highlights: [
      'Conexão estável diretamente do seu número comercial sem custos extras por mensagem.',
      'Confirmação automática imediata enviada ao cliente após o agendamento na vitrine web.',
      'Lembretes programados enviados antes do horário marcado para reduzir a taxa de faltas (no-show).',
      'Suporte a cancelamento facilitado pelo cliente via WhatsApp com liberação automática da vaga na agenda.',
      'Reconexão automática inteligente em caso de oscilações de rede.',
    ],
    impact: 'Redução de até 80% das faltas e esquecimentos por parte dos clientes da barbearia.',
  },
  {
    id: 'v1-8',
    version: 'v1.8',
    date: '18 de Outubro de 2026',
    title: 'Vitrine Pública Online com Agendamento Web 24h',
    category: 'NEW',
    categoryLabel: 'Novo Recurso',
    badgeColor: '#E5B338',
    badgeBg: 'rgba(229, 179, 56, 0.15)',
    summary:
      'Página pública elegante e personalizável para cada barbearia receber agendamentos dia e noite.',
    highlights: [
      'Link exclusivo barberflow.com/[slug] pronto para colocar na bio do Instagram e no status do WhatsApp.',
      'Cliente escolhe serviço, barbeiro de preferência e horário sem precisar criar conta ou baixar app.',
      'Cálculo automático de horários livres baseado nos intervalos e expedientes da barbearia.',
      'Exibição de fotos da barbearia, mapa com endereço geolocalizado e links para redes sociais.',
    ],
    impact: 'Sua barbearia aberta para agendamentos 24 horas por dia, 7 dias por semana.',
  },
  {
    id: 'v1-5',
    version: 'v1.5',
    date: '17 de Outubro de 2026',
    title: 'Fluxo de Caixa & Divisão Automática de Comissões',
    category: 'IMPROVEMENT',
    categoryLabel: 'Melhoria',
    badgeColor: '#06B6D4',
    badgeBg: 'rgba(6, 182, 212, 0.15)',
    summary:
      'Controle financeiro com cálculo automático de comissões por atendimento e extrato financeiro detalhado.',
    highlights: [
      'Comissão percentual configurável individualmente para cada profissional.',
      'Cálculo automático do valor do barbeiro e da parte da barbearia a cada atendimento concluído.',
      'Lançamento rápido de despesas e receitas avulsas com categorização.',
      'Resumo diário e mensal de faturamento para tomada de decisões financeiras precisas.',
    ],
    impact: 'Fim das planilhas manuais e das discussões sobre fechamento de comissão no final de semana.',
  },
];

export default function NovidadesPage() {
  const { tenant } = useAuth();
  const [filter, setFilter] = useState<CategoryFilter>('ALL');
  const [isSuggestModalOpen, setIsSuggestModalOpen] = useState(false);
  const [suggestionType, setSuggestionType] = useState('Novo Recurso');
  const [suggestionText, setSuggestionText] = useState('');
  const [suggestSuccess, setSuggestSuccess] = useState(false);

  const filteredItems = CHANGELOG_DATA.filter((item) => {
    if (filter === 'ALL') return true;
    return item.category === filter;
  });

  const handleSendSuggestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!suggestionText.trim()) return;

    // Gera mensagem estruturada para envio
    const salon = tenant?.name || 'Barbearia';
    const msg = `💡 *Sugestão de Recurso para o BarberFlow*\n\n` +
      `🏢 *Salão:* ${salon}\n` +
      `🏷️ *Tipo:* ${suggestionType}\n` +
      `📝 *Sugestão:* ${suggestionText.trim()}\n\n` +
      `Enviado via Central de Novidades do BarberFlow.`;

    const waUrl = `https://wa.me/5519982131483?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank');

    setSuggestSuccess(true);
    setTimeout(() => {
      setSuggestSuccess(false);
      setIsSuggestModalOpen(false);
      setSuggestionText('');
    }, 2000);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-main)' }}>
      <Sidebar />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Header />

        <main style={{ padding: '32px', flex: 1, maxWidth: '1200px', width: '100%', margin: '0 auto' }}>
          {/* Hero Banner */}
          <div
            className="glass-panel"
            style={{
              padding: '36px',
              borderRadius: '16px',
              marginBottom: '32px',
              background: 'linear-gradient(135deg, rgba(229, 179, 56, 0.08) 0%, rgba(18, 24, 38, 0.9) 100%)',
              border: '1px solid rgba(229, 179, 56, 0.25)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '-40px',
                right: '-40px',
                width: '180px',
                height: '180px',
                borderRadius: '50%',
                background: 'rgba(229, 179, 56, 0.08)',
                filter: 'blur(40px)',
                pointerEvents: 'none',
              }}
            />

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' }}>
              <div style={{ maxWidth: '680px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '4px 12px', borderRadius: '20px', background: 'rgba(229, 179, 56, 0.15)', border: '1px solid rgba(229, 179, 56, 0.3)', color: 'var(--primary)', fontSize: '0.8rem', fontWeight: 700, marginBottom: '14px' }}>
                  <Sparkles size={14} />
                  <span>Central de Novidades & Atualizações</span>
                </div>

                <h1 style={{ fontSize: '2.1rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '10px' }}>
                  O que há de novo no <span style={{ color: 'var(--primary)' }}>BarberFlow</span>
                </h1>

                <p style={{ color: 'var(--text-muted)', fontSize: '0.98rem', lineHeight: 1.6 }}>
                  Nosso time lança melhorias, correções e novas funcionalidades continuamente.
                  Confira abaixo o histórico de lançamentos e descubra como tirar mais proveito do sistema.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255, 255, 255, 0.04)', padding: '10px 16px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10B981', boxShadow: '0 0 10px #10B981' }} />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 600 }}>
                    Versão Atual: <strong style={{ color: 'var(--primary)' }}>{SYSTEM_VERSION}</strong>
                  </span>
                </div>

                <button
                  onClick={() => setIsSuggestModalOpen(true)}
                  className="gold-gradient-primary gold-glow"
                  style={{
                    padding: '10px 18px',
                    borderRadius: '8px',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                  }}
                >
                  <Lightbulb size={16} />
                  <span>Sugerir uma Melhoria</span>
                </button>
              </div>
            </div>
          </div>

          {/* Filtros por Categoria */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '28px',
              flexWrap: 'wrap',
              background: 'rgba(18, 24, 38, 0.6)',
              padding: '6px',
              borderRadius: '12px',
              border: '1px solid var(--border-color)',
            }}
          >
            {[
              { id: 'ALL', label: 'Todas as Atualizações', count: CHANGELOG_DATA.length },
              { id: 'NEW', label: 'Novos Recursos 🔥', count: CHANGELOG_DATA.filter((i) => i.category === 'NEW').length },
              { id: 'IMPROVEMENT', label: 'Melhorias ⚡', count: CHANGELOG_DATA.filter((i) => i.category === 'IMPROVEMENT').length },
              { id: 'DESIGN', label: 'Design & UX 🎨', count: CHANGELOG_DATA.filter((i) => i.category === 'DESIGN').length },
              { id: 'WHATSAPP', label: 'WhatsApp & Bot 💬', count: CHANGELOG_DATA.filter((i) => i.category === 'WHATSAPP').length },
            ].map((tab) => {
              const active = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id as CategoryFilter)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontSize: '0.84rem',
                    fontWeight: active ? 700 : 500,
                    background: active ? 'var(--primary)' : 'transparent',
                    color: active ? '#0B0F17' : 'var(--text-muted)',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>{tab.label}</span>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      padding: '1px 6px',
                      borderRadius: '10px',
                      background: active ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.08)',
                      color: active ? '#0B0F17' : 'var(--text-dim)',
                    }}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Timeline Feed */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {filteredItems.map((item, idx) => (
              <div
                key={item.id}
                className="glass-panel"
                style={{
                  padding: '28px',
                  borderRadius: '14px',
                  border: idx === 0 ? '1px solid rgba(229, 179, 56, 0.4)' : '1px solid var(--border-color)',
                  position: 'relative',
                  boxShadow: idx === 0 ? '0 0 20px rgba(229, 179, 56, 0.08)' : 'none',
                }}
              >
                {/* Header do Item */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                        fontWeight: 800,
                        background: 'linear-gradient(135deg, #E5B338, #966C0F)',
                        color: '#0B0F17',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {item.version}
                    </span>

                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: item.badgeBg,
                        color: item.badgeColor,
                        border: `1px solid ${item.badgeColor}40`,
                      }}
                    >
                      {item.categoryLabel}
                    </span>

                    {idx === 0 && (
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '12px',
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: '#10B981',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' }} />
                        LANÇAMENTO RECENTE
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-dim)', fontSize: '0.82rem' }}>
                    <Calendar size={14} />
                    <span>{item.date}</span>
                  </div>
                </div>

                {/* Título e Resumo */}
                <h3 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>
                  {item.title}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', lineHeight: 1.6, marginBottom: '18px' }}>
                  {item.summary}
                </p>

                {/* Highlights / Recursos detalhados */}
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    padding: '16px 20px',
                    borderRadius: '10px',
                    border: '1px solid rgba(255, 255, 255, 0.04)',
                    marginBottom: '16px',
                  }}
                >
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '10px' }}>
                    Destaques desta versão:
                  </span>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {item.highlights.map((h, i) => (
                      <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '0.88rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
                        <CheckCircle2 size={16} color="var(--primary)" style={{ flexShrink: 0, marginTop: '3px' }} />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Impacto para o salão */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: 'var(--text-dim)' }}>
                  <Zap size={14} color="#FBBF24" />
                  <span>
                    <strong>Impacto no seu salão:</strong> {item.impact}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Footer Callout */}
          <div
            className="glass-card"
            style={{
              marginTop: '40px',
              padding: '24px',
              borderRadius: '12px',
              textAlign: 'center',
              background: 'rgba(229, 179, 56, 0.04)',
              border: '1px solid rgba(229, 179, 56, 0.2)',
            }}
          >
            <Lightbulb size={28} color="var(--primary)" style={{ marginBottom: '8px' }} />
            <h4 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '6px' }}>
              Tem uma ideia para melhorar o BarberFlow?
            </h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', maxWidth: '520px', margin: '0 auto 16px auto' }}>
              Nossos novos recursos são criados a partir das necessidades reais dos nossos clientes. Conte pra gente o que facilitaria a sua rotina!
            </p>
            <button
              onClick={() => setIsSuggestModalOpen(true)}
              className="gold-gradient-primary"
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                fontSize: '0.88rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Send size={15} />
              <span>Enviar Minha Sugestão</span>
            </button>
          </div>
        </main>
      </div>

      {/* Modal de Sugestão de Recursos */}
      <Modal
        isOpen={isSuggestModalOpen}
        onClose={() => setIsSuggestModalOpen(false)}
        title="Sugerir Melhoria para o BarberFlow"
        maxWidth="540px"
      >
        {suggestSuccess ? (
          <div style={{ textAlign: 'center', padding: '24px 10px' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.2)', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
              <Check size={28} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '6px' }}>Sugestão Aberta no WhatsApp!</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
              Obrigado por nos ajudar a tornar o BarberFlow cada dia melhor. Nossa equipe analisará sua ideia!
            </p>
          </div>
        ) : (
          <form onSubmit={handleSendSuggestion} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Tipo de Sugestão
              </label>
              <select
                value={suggestionType}
                onChange={(e) => setSuggestionType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-main)',
                  fontSize: '0.88rem',
                }}
              >
                <option value="Novo Recurso">Novo Recurso (Ideia nova)</option>
                <option value="Melhoria em Recurso Existente">Melhoria em Recurso Existente</option>
                <option value="Facilidade de Uso / Visual">Visual & Experiência de Uso</option>
                <option value="Automação WhatsApp">WhatsApp & Mensagens Automáticas</option>
                <option value="Outro">Outro Assunto</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Descreva sua ideia ou necessidade *
              </label>
              <textarea
                required
                rows={4}
                placeholder="Ex: Gostaria de poder bloquear horários de almoço recorrentes para todos os barbeiros de uma só vez..."
                value={suggestionText}
                onChange={(e) => setSuggestionText(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-main)',
                  fontSize: '0.88rem',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setIsSuggestModalOpen(false)}
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-muted)',
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="gold-gradient-primary gold-glow"
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Send size={15} />
                <span>Enviar Sugestão via WhatsApp</span>
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
