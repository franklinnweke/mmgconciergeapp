import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { assertSameOrigin } from '@/features/auth/server/same-origin';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request.headers);
  } catch {
    return NextResponse.json({ error: 'Request origin could not be verified.' }, { status: 403 });
  }

  const cookieStore = await cookies();
  cookieStore.delete('__session');
  return NextResponse.json({ ok: true });
}
