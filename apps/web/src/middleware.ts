import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_DOMAINS = [
  'barberflow.azespo.com.br',
  'azespo.com.br',
  'localhost',
  '127.0.0.1',
];

function isSystemHost(rawHost: string): boolean {
  const host = rawHost.split(':')[0].toLowerCase().trim();
  if (!host) return true;
  if (SYSTEM_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) return true;
  if (
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    host.startsWith('172.') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Ignora rotas de API, arquivos estáticos e assets do Next.js
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    /\.[a-zA-Z0-9]{2,5}$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  const rawHost = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
  const cleanHost = rawHost.split(',')[0].split(':')[0].toLowerCase().trim();

  // Se for o domínio oficial do SaaS ou IP local, segue o fluxo padrão
  if (isSystemHost(cleanHost)) {
    return NextResponse.next();
  }

  // É um Domínio Próprio (Custom Domain) de um salão Premium (ex: barba.lgtelecom.com.br)
  try {
    const apiBase = process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000';
    const res = await fetch(
      `${apiBase}/api/public/tenants/by-domain/${encodeURIComponent(cleanHost)}`,
      {
        headers: { Accept: 'application/json' },
        next: { revalidate: 30 },
      }
    );

    if (res.ok) {
      const data = await res.json();
      const slug = data?.tenant?.slug;

      if (slug) {
        const url = req.nextUrl.clone();

        if (pathname === '/' || pathname === '') {
          url.pathname = `/${slug}`;
          return NextResponse.rewrite(url);
        }

        if (pathname === '/agendar' || pathname === '/agendar/') {
          url.pathname = `/${slug}/agendar`;
          return NextResponse.rewrite(url);
        }
      }
    }
  } catch {
    // Em caso de falha momentânea, deixa a página lidar com o fallback client-side
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
