export function ownerCommandErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return 'Something went wrong. Please try again.';
  }

  // Handle Firebase Functions HttpsError details { code, reason }
  const details = (error as { details?: Record<string, unknown> }).details;
  const domainCode = details?.code ? String(details.code) : '';
  const reason = details?.reason ? String(details.reason) : '';

  // Handle Firebase native or JS error code string
  const errorCode = (error as { code?: unknown }).code ? String((error as { code: unknown }).code) : '';

  // Specific domain code + reason mappings
  if (domainCode === 'UNAUTHENTICATED') {
    return 'Sign in to continue.';
  }

  if (domainCode === 'FORBIDDEN') {
    if (reason === 'email_unverified') return 'Verify your email before continuing.';
    if (reason === 'phone_unverified') return 'Verify a Nigerian phone number before continuing.';
    if (reason === 'not_owner') return 'This application is only available on an owner account.';
    if (reason === 'not_staff') return 'You are not authorized to review owner applications.';
    return 'You cannot do that.';
  }

  if (domainCode === 'INVALID_ARGUMENT') {
    return 'Check the highlighted fields and try again.';
  }

  if (domainCode === 'PROFILE_INCOMPLETE') {
    return 'Complete every required step before submitting.';
  }

  if (domainCode === 'INVALID_STATE_TRANSITION') {
    return 'Your application cannot be updated in its current state. Refresh and try again.';
  }

  if (domainCode === 'FAILED_PRECONDITION') {
    if (reason === 'not_paid') {
      return 'Only a paid booking can be confirmed or declined.';
    }
    if (reason === 'upload_invalid') {
      return 'The identity document could not be used. Take a clearer photo and try again.';
    }
    if (reason === 'terms_stale') {
      return 'Accept the current owner terms to continue.';
    }
    if (reason === 'stale_version') {
      return 'This record changed. Refresh and try again.';
    }
  }

  if (domainCode === 'IDEMPOTENCY_CONFLICT') {
    return 'This request does not match the previous attempt. Refresh and try again.';
  }

  if (domainCode === 'CONFIGURATION_UNAVAILABLE') {
    return 'Owner verification is temporarily unavailable.';
  }

  // Auth & Storage specific error codes
  if (errorCode === 'auth/invalid-verification-code') {
    return 'That code is incorrect. Try again.';
  }
  if (errorCode === 'auth/invalid-phone-number') {
    return 'Enter a valid Nigerian mobile number.';
  }
  if (errorCode === 'auth/too-many-requests') {
    return 'Too many attempts. Wait a moment and try again.';
  }
  if (errorCode === 'auth/credential-already-in-use') {
    return 'That phone number is already used by another account.';
  }
  if (errorCode === 'storage/unauthorized') {
    return 'The document could not be stored. Try again.';
  }
  if (errorCode === 'auth/network-request-failed' || errorCode === 'network-request-failed') {
    return 'Check your connection and try again.';
  }

  return 'Something went wrong. Please try again.';
}
