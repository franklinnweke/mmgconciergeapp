import {
  accountProfileSchema,
  type AccountProfile,
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

export type IdentityDestination = 'auth' | 'account-setup' | 'verify-email' | 'renter' | 'owner';

export function resolveIdentityDestination(input: {
  emailVerified: boolean;
  hasUser: boolean;
  profile: AccountProfile | null;
}): IdentityDestination {
  if (!input.hasUser) return 'auth';
  if (!input.profile) return 'account-setup';
  if (!input.emailVerified) return 'verify-email';
  return input.profile.accountType;
}
