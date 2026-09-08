import {
  accountProfileSchema,
  type AccountProfile,
  type AccountType,
} from '@mmg/contracts';

export function decodeAccountProfile(value: unknown, expectedUid: string): AccountProfile {
  const profile = accountProfileSchema.parse(value);
  if (profile.uid !== expectedUid) {
    throw new Error('This account profile does not match the signed-in user.');
  }
  return profile;
}

export async function resolveRegistrationAccountProfile(
  existingProfile: AccountProfile | null,
  createSelectedProfile: () => Promise<AccountProfile>,
): Promise<AccountProfile> {
  return existingProfile ?? createSelectedProfile();
}

export function shouldPublishAuthSnapshot(profileMutationVersion: number): boolean {
  return profileMutationVersion % 2 === 0;
}

export type AuthIntent = AccountType | 'sign-in' | null;
// Preserve the choice through sign-in and verification; discard it on sign-out
// or direct identity replacement, never merely because the form is signed out.
export function preserveAuthIntent(intent: AuthIntent, previousUid: string | null, uid: string | null): AuthIntent {
  return previousUid !== null && previousUid !== uid ? null : intent;
}
export type IdentityDestination = 'auth' | 'account-setup' | 'verify-email' | 'renter';
export type AuthenticatedIntentDestination = 'renter' | 'owner';

export function resolveIdentityDestination(input: {
  emailVerified: boolean;
  hasUser: boolean;
  profile: AccountProfile | null;
}): IdentityDestination {
  if (!input.hasUser) return 'auth';
  if (!input.profile) return 'account-setup';
  if (!input.emailVerified) return 'verify-email';
  return 'renter';
}

export function resolveAuthenticatedIntentDestination(
  intent: AuthIntent,
): AuthenticatedIntentDestination {
  return intent === 'owner' ? 'owner' : 'renter';
}
