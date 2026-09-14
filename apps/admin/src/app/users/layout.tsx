import 'server-only';

import type { ReactNode } from 'react';

import { requireStaffCapability } from '@/features/auth/server/session';

export const dynamic = 'force-dynamic';

export default async function UsersLayout({ children }: { children: ReactNode }) {
  await requireStaffCapability('users.read');
  return <>{children}</>;
}
