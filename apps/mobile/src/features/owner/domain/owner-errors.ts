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
    return 'Upload not permitted. Ensure your email is verified and your owner profile details are saved before uploading your ID.';
  }
  if (errorCode === 'auth/network-request-failed' || errorCode === 'network-request-failed') {
    return 'Check your connection and try again.';
  }

  return 'Something went wrong. Please try again.';
}

export function mapVehicleListingError(err: unknown): string {
  if (!err) return 'An unexpected error occurred. Please try again.';
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (lower.includes('not_approved_owner') || lower.includes('must be approved')) {
    return 'Your owner verification must be approved before you can list a vehicle.';
  }
  if (lower.includes('image_dimensions') || lower.includes('pixels') || lower.includes('resolution')) {
    return message;
  }
  if (lower.includes('listing_incomplete') || lower.includes('no images') || lower.includes('usable photo')) {
    return 'Please add and upload at least one vehicle photo before submitting for review.';
  }
  if (lower.includes('terms_stale')) {
    return 'Your owner agreement is outdated. Please review and accept the latest owner terms.';
  }
  if (lower.includes('stale') || lower.includes('modified') || lower.includes('refresh') || lower.includes('version')) {
    return 'The vehicle record was updated during submission. Please refresh and try again.';
  }
  if (lower.includes('idempotency_conflict')) {
    return 'A submission with this request is already in progress. Please refresh.';
  }
  if (lower.includes('failed_precondition')) {
    return 'Vehicle listing cannot be submitted in its current state. Please verify all details.';
  }
  if (lower.includes('unauthenticated')) {
    return 'Please sign in to list your vehicle.';
  }
  if (lower.includes('permission') || lower.includes('forbidden')) {
    return 'You do not have authorization to perform this action.';
  }
  return 'Failed to submit vehicle listing. Please check the vehicle details and try again.';
}
