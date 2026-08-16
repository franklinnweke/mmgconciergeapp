import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

function assertSameOrigin(h: Headers): void {
  const origin = h.get('origin');
  const host = h.get('host');
  if (!origin || !host) return;
  try {
    const originHost = new URL(origin).host;
    if (originHost !== host) {
      throw new Error('Cross-origin requests are not allowed.');
    }
  } catch {
    throw new Error('Invalid origin header.');
  }
}

export async function POST(request: Request) {
  assertSameOrigin(request.headers);
  const cookieStore = await cookies();
  cookieStore.delete('__session');
  return NextResponse.json({ ok: true });
}
