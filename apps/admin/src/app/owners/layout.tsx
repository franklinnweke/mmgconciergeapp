import 'server-only';

import { ReactNode } from 'react';

import { requireStaffCapability } from '@/features/auth/server/session';

export const dynamic = 'force-dynamic';

export default async function OwnersLayout({ children }: { children: ReactNode }) {
  // Enforces server-only session cookie check with live custom claims
  // verification, then the owner-desk capability. Every route beneath this
  // layout exposes masked applicant PII and signed government-ID URLs, so a
  // staff claim alone is not sufficient.
  await requireStaffCapability('owners.read');

  return <>{children}</>;
}
