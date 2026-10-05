import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const PUBLIC_PATHS = ['/login', '/_next', '/api', '/manifest.json', '/icon-'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || pathname.includes('.')) {
    return NextResponse.next();
  }

  const token = request.cookies.get('auth_token')?.value;
  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? 'dev-insecure-change-me');
    const { payload } = await jwtVerify(token, secret);

    if ((pathname.startsWith('/settings') || pathname.startsWith('/admin')) && payload.role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    const res = NextResponse.next();
    res.headers.set('Cache-Control', 'no-store, must-revalidate');
    res.headers.set('Pragma', 'no-cache');
    return res;
  } catch {
    const res = NextResponse.redirect(new URL('/login', request.url));
    res.cookies.set('auth_token', '', { maxAge: 0, path: '/' });
    return res;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
