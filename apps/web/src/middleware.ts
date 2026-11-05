import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware de proteção do Next.js 15:
 * Bloqueia probes automatizados de bots/scanners que enviam headers `Next-Action` inválidos
 * (ex: "x", "z", "y", "j", "aa") ou payloads malformados de Server Actions,
 * evitando logs de `Failed to find Server Action` e `uncaughtException: Body exceeded 1 MB limit`.
 */
export function middleware(request: NextRequest) {
  if (request.headers.has('next-action')) {
    return NextResponse.json(
      { error: 'Server Actions are not enabled on this application.' },
      { status: 400 },
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
