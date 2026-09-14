import 'server-only';

import { requireStaffCapability } from '@/features/auth/server/session';
import { UserDirectory } from '@/features/users/components/user-directory';
import {
  FirestoreAdminUserGateway,
  USER_DIRECTORY_PAGE_SIZE,
} from '@/features/users/data/firestore-admin-user-gateway';

export const dynamic = 'force-dynamic';

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string | string[] }>;
}) {
  const session = await requireStaffCapability('users.read');
  const { cursor } = await searchParams;
  const requestedCursor = Array.isArray(cursor) ? cursor[0] : cursor;
  const page = await new FirestoreAdminUserGateway().listUsers({
    cursor: requestedCursor,
    pageSize: USER_DIRECTORY_PAGE_SIZE,
  });

  return (
    <UserDirectory
      items={page.items}
      isFirstPage={!requestedCursor}
      nextCursor={page.nextCursor}
      staffEmail={session.email}
      staffRole={session.role}
    />
  );
}
