import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { createStaffSessionCookie } from '@/features/auth/server/session';

function assertSameOrigin(h: Headers): void {
  const origin = h.get('origin');
  const host = h.get('host');
  if (!origin || !host) return; // Allow server-to-server requests
  try {
    const originHost = new URL(origin).host;
    if (originHost !== host) {
      throw new Error('Cross-origin session requests are not allowed.');
    }
  } catch {
    throw new Error('Invalid origin header.');
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request.headers);
    const body = await request.json();
    const { idToken } = body;

    if (!idToken || typeof idToken !== 'string') {
      return NextResponse.json({ error: 'Missing ID token.' }, { status: 400 });
    }

    const sessionCookie = await createStaffSessionCookie(idToken);
    const cookieStore = await cookies();

    cookieStore.set('__session', sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 5 * 24 * 60 * 60, // 5 days
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Staff sign-in could not be completed.' }, { status: 401 });
  }
}
