import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { createStaffSessionCookie } from '@/features/auth/server/session';

export async function POST(request: Request) {
  try {
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
