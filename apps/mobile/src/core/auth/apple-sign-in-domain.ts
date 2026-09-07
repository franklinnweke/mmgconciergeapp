export type AppleNameParts = {
  familyName?: string | null;
  givenName?: string | null;
  middleName?: string | null;
};

export function formatAppleDisplayName(fullName: AppleNameParts | null | undefined): string {
  return [fullName?.givenName, fullName?.middleName, fullName?.familyName]
    .map((part) => part?.trim() ?? '')
    .filter(Boolean)
    .join(' ');
}

export function isAppleSignInCancellation(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && error.code === 'ERR_REQUEST_CANCELED',
  );
}

export function requireAppleIdentityToken(identityToken: string | null | undefined): string {
  if (!identityToken) {
    throw new Error('Apple did not return an identity token. Please try again.');
  }
  return identityToken;
}
