import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_DOMAINS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  'barberflow.azespo.com.br',
  'azespo.com.br',
];

const RESERVED_PATHS = [
  '/_next',
  '/api',
  '/favicon.ico',
  '/login',
  '/register',
  '/dashboard',
  '/calendario',
  '/profissionais',
  '/servicos',
  '/clientes',
  '/financeiro',
  '/nfse',
  '/relatorios',
  '/chat',
  '/whatsapp',
  '/configuracoes',
  '/novidades',
  '/planos',
  '/admin',
  '/termos',
  '/privacidade',
];

// Cache em memória no Edge/Middleware (TTL de 60s) para resolução instantânea de domínios próprios
const domainSlugCache = new Map<string, { slug: string; expiresAt: number }>();

export async function middleware(req: NextRequest) {
  // 1. Proteção Next.js 15: bloqueia probes automatizados de bots com header `Next-Action` inválido
  if (req.headers.has('next-action')) {
    return NextResponse.json(
      { error: 'Server Actions are not enabled on this application.' },
      { status: 400 },
    );
  }

  const { pathname } = req.nextUrl;

  // Ignora rotas reservadas do painel administrativo e arquivos estáticos
  if (
    RESERVED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Captura o domínio acessado pelo visitante (priorizando X-Forwarded-Host do proxy/Cloudflare)
  const rawHost = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
  const hostname = rawHost.split(',')[0].trim().split(':')[0].toLowerCase().replace(/^www\./, '');

  if (!hostname) {
    return NextResponse.next();
  }

  // Se for o domínio oficial do SaaS ou ambiente local/Easypanel, segue o roteamento normal
  const isSystemDomain =
    SYSTEM_DOMAINS.includes(hostname) ||
    hostname.endsWith('.azespo.com.br') ||
    hostname.endsWith('.easypanel.host') ||
    hostname.endsWith('.sslip.io') ||
    hostname.endsWith('.nip.io');

  if (isSystemDomain) {
    return NextResponse.next();
  }

  // Verifica se o domínio customizado já está no cache rápido
  const now = Date.now();
  const cached = domainSlugCache.get(hostname);
  let slug: string | null = cached && cached.expiresAt > now ? cached.slug : null;

  if (!slug) {
    try {
      const apiInternal = process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000';
      const res = await fetch(
        `${apiInternal}/api/public/resolve-domain?domain=${encodeURIComponent(hostname)}`,
        {
          headers: { Accept: 'application/json' },
          next: { revalidate: 60 },
        },
      );

      if (res.ok) {
        const data = (await res.json()) as { slug?: string };
        if (data?.slug) {
          slug = data.slug;
          domainSlugCache.set(hostname, { slug, expiresAt: now + 60_000 });
        }
      }
    } catch {
      // Silencia erro de rede caso a API interna esteja reiniciando
    }
  }

  if (!slug) {
    return NextResponse.next();
  }

  // Se a URL já estiver apontando para `/${slug}`, evita duplicar no rewrite
  if (pathname === `/${slug}` || pathname.startsWith(`/${slug}/`)) {
    return NextResponse.next();
  }

  // Reescreve transparentemente (mantendo o domínio próprio do salão na barra de endereço do cliente):
  // - `/`        -> `/${slug}` (Página Inicial / Vitrine)
  // - `/agendar` -> `/${slug}/agendar` (Formulário de Agendamento)
  const rewriteUrl = req.nextUrl.clone();
  rewriteUrl.pathname = pathname === '/' ? `/${slug}` : `/${slug}${pathname}`;

  return NextResponse.rewrite(rewriteUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
