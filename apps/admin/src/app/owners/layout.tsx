import 'server-only';

import { ReactNode } from 'react';

import { requireLiveStaffSession } from '@/features/auth/server/session';

export const dynamic = 'force-dynamic';

export default async function OwnersLayout({ children }: { children: ReactNode }) {
  // Enforces server-only session cookie check with live custom claims verification
  await requireLiveStaffSession();

  return <>{children}</>;
}
