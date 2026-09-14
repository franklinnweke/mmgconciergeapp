import 'server-only';

import { getAdminAuth, getAdminFirestore } from '@/features/auth/server/firebase-admin';

export const USER_DIRECTORY_PAGE_SIZE = 100;

export type AdminUserListItem = {
  uid: string;
  displayName: string;
  email: string;
  accountType: 'renter' | 'owner' | 'unassigned';
  disabled: boolean;
  emailVerified: boolean;
  createdAt: string;
  lastSignInAt: string | null;
};

export type AdminUserPage = {
  items: AdminUserListItem[];
  nextCursor: string | null;
};

type UserProfileDocument = {
  accountType?: unknown;
  displayName?: unknown;
  email?: unknown;
};

function accountTypeFromProfile(value: unknown): AdminUserListItem['accountType'] {
  return value === 'renter' || value === 'owner' ? value : 'unassigned';
}

export class FirestoreAdminUserGateway {
  async listUsers(input: { cursor?: string; pageSize?: number } = {}): Promise<AdminUserPage> {
    const auth = getAdminAuth();
    const firestore = getAdminFirestore();
    const pageSize = Math.min(Math.max(input.pageSize ?? USER_DIRECTORY_PAGE_SIZE, 1), 1000);
    const authPage = await auth.listUsers(pageSize, input.cursor);

    const profileRefs = authPage.users.map((user) => firestore.collection('users').doc(user.uid));
    const profileSnapshots = profileRefs.length > 0 ? await firestore.getAll(...profileRefs) : [];
    const profiles = new Map<string, UserProfileDocument>();

    for (const snapshot of profileSnapshots) {
      if (snapshot.exists) profiles.set(snapshot.id, snapshot.data() as UserProfileDocument);
    }

    const items = authPage.users.map((user): AdminUserListItem => {
      const profile = profiles.get(user.uid);
      const profileDisplayName = typeof profile?.displayName === 'string' ? profile.displayName.trim() : '';
      const profileEmail = typeof profile?.email === 'string' ? profile.email.trim() : '';

      return {
        uid: user.uid,
        displayName: profileDisplayName || user.displayName?.trim() || 'Unnamed user',
        email: profileEmail || user.email || 'No email',
        accountType: accountTypeFromProfile(profile?.accountType),
        disabled: user.disabled,
        emailVerified: user.emailVerified,
        createdAt: user.metadata.creationTime,
        lastSignInAt: user.metadata.lastSignInTime || null,
      };
    });

    return {
      items,
      nextCursor: authPage.pageToken ?? null,
    };
  }
}
