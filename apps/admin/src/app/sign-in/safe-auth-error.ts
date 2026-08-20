export function safeAuthError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
    return 'The email or password is not recognised.';
  }
  if (code.includes('too-many-requests')) return 'Too many attempts. Wait a moment and try again.';
  if (code.includes('network-request-failed')) return 'The sign-in service is unavailable. Check your connection and try again.';
  if (code.includes('user-disabled')) return 'This staff account is disabled. Contact a super admin.';
  if (
    error instanceof Error &&
    (error.message === 'Access denied. Staff email must be verified.' ||
      error.message === 'Access denied. Staff verification privileges required.')
  ) {
    return error.message;
  }
  return 'Staff sign-in failed. Check your credentials and try again.';
}
