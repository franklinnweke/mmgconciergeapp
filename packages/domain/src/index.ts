const wholeNairaFormatter = new Intl.NumberFormat('en-NG', {
  currency: 'NGN',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
  style: 'currency',
});

export function formatNairaFromKobo(amountKobo: number): string {
  if (!Number.isSafeInteger(amountKobo)) {
    throw new TypeError('Money must be supplied as an integer number of kobo.');
  }

  return wholeNairaFormatter.format(amountKobo / 100).replace('NGN', '₦');
}
export const DEFAULT_SERVICE_FEE_BPS = 800;
export const DEFAULT_SERVICE_FEE_FIXED_KOBO = 0;
export const DEFAULT_OWNER_COMMISSION_BPS = 1_500;

export type BookingQuote = {
  durationDays: number;
  rentalKobo: number;
  serviceFeeKobo: number;
  totalKobo: number;
};

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function assertSafeKobo(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer number of kobo.`);
  }
  return value;
}

function safeAdd(left: number, right: number, label: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw new RangeError(`${label} exceeds safe integer range.`);
  return result;
}

function safeMultiply(left: number, right: number, label: string): number {
  const result = left * right;
  if (!Number.isSafeInteger(result)) throw new RangeError(`${label} exceeds safe integer range.`);
  return result;
}

export function dateOnlyToEpochDay(value: string): number {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) throw new TypeError('Booking dates must use YYYY-MM-DD.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new TypeError('Booking date must be a real calendar date.');
  }
  return Math.floor(timestamp / 86_400_000);
}

export function calculateChargedDays(startDate: string, exclusiveEndDate: string): number {
  const days = dateOnlyToEpochDay(exclusiveEndDate) - dateOnlyToEpochDay(startDate);
  if (!Number.isSafeInteger(days) || days < 1 || days > 365) {
    throw new RangeError('Booking must span between 1 and 365 charged calendar days.');
  }
  return days;
}

export function roundBasisPointsHalfUp(amountKobo: number, basisPoints: number): number {
  assertSafeKobo(amountKobo, 'Amount');
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    throw new RangeError('Basis points must be an integer between 0 and 10,000.');
  }
  const quotient = Math.floor(amountKobo / 10_000);
  const remainder = amountKobo % 10_000;
  return safeAdd(
    safeMultiply(quotient, basisPoints, 'Basis-point amount'),
    Math.floor((remainder * basisPoints + 5_000) / 10_000),
    'Basis-point amount',
  );
}

export type AuthoritativePriceInput = {
  ownerDailyRateKobo: number;
  chargedDays: number;
  deliveryFeeKobo: number;
  serviceFeeBps: number;
  serviceFeeFixedKobo: number;
  ownerCommissionBps: number;
  configVersion: string;
  termsVersion: string;
  cancellationPolicyVersion: string;
};

export type AuthoritativePriceSnapshot = AuthoritativePriceInput & {
  currency: 'NGN';
  baseRentalKobo: number;
  serviceFeeKobo: number;
  ownerCommissionKobo: number;
  ownerEarningsKobo: number;
  renterTotalKobo: number;
};

export function calculateAuthoritativePrice(input: AuthoritativePriceInput): AuthoritativePriceSnapshot {
  const dailyRate = assertSafeKobo(input.ownerDailyRateKobo, 'Owner daily rate');
  const deliveryFee = assertSafeKobo(input.deliveryFeeKobo, 'Delivery fee');
  const fixedFee = assertSafeKobo(input.serviceFeeFixedKobo, 'Fixed service fee');
  if (!Number.isSafeInteger(input.chargedDays) || input.chargedDays < 1 || input.chargedDays > 365) {
    throw new RangeError('Charged days must be an integer between 1 and 365.');
  }
  const baseRentalKobo = safeMultiply(dailyRate, input.chargedDays, 'Base rental');
  const serviceFeeKobo = safeAdd(
    roundBasisPointsHalfUp(baseRentalKobo, input.serviceFeeBps),
    fixedFee,
    'Service fee',
  );
  const ownerCommissionKobo = roundBasisPointsHalfUp(baseRentalKobo, input.ownerCommissionBps);
  if (ownerCommissionKobo > baseRentalKobo) throw new RangeError('Owner commission exceeds base rental.');
  const ownerEarningsKobo = baseRentalKobo - ownerCommissionKobo;
  const renterTotalKobo = safeAdd(
    safeAdd(baseRentalKobo, deliveryFee, 'Renter total'),
    serviceFeeKobo,
    'Renter total',
  );
  return {
    ...input,
    currency: 'NGN',
    baseRentalKobo,
    deliveryFeeKobo: deliveryFee,
    serviceFeeFixedKobo: fixedFee,
    serviceFeeKobo,
    ownerCommissionKobo,
    ownerEarningsKobo,
    renterTotalKobo,
  };
}

export function intervalsOverlap(
  left: { startDate: string; endDate: string },
  right: { startDate: string; endDate: string },
): boolean {
  const leftStart = dateOnlyToEpochDay(left.startDate);
  const leftEnd = dateOnlyToEpochDay(left.endDate);
  const rightStart = dateOnlyToEpochDay(right.startDate);
  const rightEnd = dateOnlyToEpochDay(right.endDate);
  if (leftEnd <= leftStart || rightEnd <= rightStart) throw new RangeError('Availability intervals must be positive.');
  return leftStart < rightEnd && rightStart < leftEnd;
}

const intentTransitions = {
  intent_created: ['checkout_pending', 'expired', 'invalid'],
  checkout_pending: ['paid', 'expired', 'failed', 'invalid', 'paid_conflict'],
  paid: [],
  expired: ['paid_conflict'],
  failed: [],
  invalid: [],
  paid_conflict: [],
} as const;

const paidBookingTransitions = {
  paid_pending_owner: ['confirmed', 'intervention_required', 'cancelled'],
  confirmed: ['in_progress', 'cancelled', 'refund_pending', 'intervention_required'],
  intervention_required: ['confirmed', 'cancelled', 'refund_pending'],
  cancelled: ['refund_pending', 'refunded'],
  refund_pending: ['refunded', 'intervention_required'],
  refunded: [],
  in_progress: ['completed', 'intervention_required'],
  completed: [],
} as const;

export type BookingIntentState = keyof typeof intentTransitions;
export type PaidBookingState = keyof typeof paidBookingTransitions;

export function canTransitionBookingIntent(from: BookingIntentState, to: BookingIntentState): boolean {
  return (intentTransitions[from] as readonly BookingIntentState[]).includes(to);
}

export function canTransitionPaidBooking(from: PaidBookingState, to: PaidBookingState): boolean {
  return (paidBookingTransitions[from] as readonly PaidBookingState[]).includes(to);
}

export function calculateBookingQuote(dailyRateKobo: number, durationDays: number): BookingQuote {
  if (!Number.isSafeInteger(dailyRateKobo) || dailyRateKobo < 0) {
    throw new TypeError('Daily rate must be a non-negative integer number of kobo.');
  }

  if (!Number.isSafeInteger(durationDays) || durationDays < 1) {
    throw new TypeError('Duration must be a positive whole number of days.');
  }

  const snapshot = calculateAuthoritativePrice({
    ownerDailyRateKobo: dailyRateKobo,
    chargedDays: durationDays,
    deliveryFeeKobo: 0,
    serviceFeeBps: DEFAULT_SERVICE_FEE_BPS,
    serviceFeeFixedKobo: DEFAULT_SERVICE_FEE_FIXED_KOBO,
    ownerCommissionBps: DEFAULT_OWNER_COMMISSION_BPS,
    configVersion: 'client-preview',
    termsVersion: 'client-preview',
    cancellationPolicyVersion: 'client-preview',
  });

  return {
    durationDays: snapshot.chargedDays,
    rentalKobo: snapshot.baseRentalKobo,
    serviceFeeKobo: snapshot.serviceFeeKobo,
    totalKobo: snapshot.renterTotalKobo,
  };
}

export const ownerVerificationTransitions = {
  draft: ['submitted'],
  submitted: ['under_review'],
  under_review: ['approved', 'rejected'],
  approved: ['suspended', 'revoked'],
  rejected: ['submitted'],
  suspended: ['approved', 'revoked'],
  revoked: [],
} as const;

export type OwnerVerificationStatus = keyof typeof ownerVerificationTransitions;
export type OwnerVerificationActor = 'owner' | 'verification_admin' | 'super_admin' | 'system';
export type OwnerReviewDecision =
  | 'start_review'
  | 'approve'
  | 'reject'
  | 'suspend'
  | 'restore'
  | 'revoke';

export function canTransitionOwnerVerification(
  from: OwnerVerificationStatus,
  to: OwnerVerificationStatus,
): boolean {
  return (ownerVerificationTransitions[from] as readonly OwnerVerificationStatus[]).includes(to);
}

export function decisionTargetStatus(decision: OwnerReviewDecision): OwnerVerificationStatus {
  switch (decision) {
    case 'start_review':
      return 'under_review';
    case 'approve':
      return 'approved';
    case 'reject':
      return 'rejected';
    case 'suspend':
      return 'suspended';
    case 'restore':
      return 'approved';
    case 'revoke':
      return 'revoked';
  }
}

export function actorMayApplyDecision(
  actor: OwnerVerificationActor,
  _decision: OwnerReviewDecision,
): boolean {
  return actor === 'verification_admin' || actor === 'super_admin';
}

export function ownerMayMutateProfile(status: OwnerVerificationStatus | null): boolean {
  return status === null || status === 'draft' || status === 'rejected';
}

export function ownerMaySubmit(status: OwnerVerificationStatus | null): boolean {
  return status === 'draft' || status === 'rejected';
}

export function isTerminalOwnerVerification(status: OwnerVerificationStatus): boolean {
  return status === 'revoked';
}

export function requiresReviewReason(decision: OwnerReviewDecision): boolean {
  return decision === 'reject' || decision === 'suspend' || decision === 'revoke';
}

export function requiresApprovalChecklist(decision: OwnerReviewDecision): boolean {
  return decision === 'approve';
}

export function validateReviewReason(reason: string): string {
  const normalized = reason.trim();
  if (normalized.length < 10 || normalized.length > 500) {
    throw new RangeError('Review reason must be between 10 and 500 characters.');
  }
  return normalized;
}

// ── Vehicle domain ──

export type VehicleModerationStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'suspended';
export type VehicleVisibility = 'paused' | 'active' | 'deleted';
export type VehicleReviewDecision = 'start_review' | 'approve' | 'reject' | 'suspend' | 'restore';

export const vehicleModerationTransitions: Record<VehicleModerationStatus, readonly VehicleModerationStatus[]> = {
  draft: ['pending_review'],
  pending_review: ['approved', 'rejected'],
  approved: ['suspended'],
  rejected: ['pending_review'],
  suspended: ['approved'],
} as const;

export const vehicleVisibilityTransitions: Record<VehicleVisibility, readonly VehicleVisibility[]> = {
  paused: ['active', 'deleted'],
  active: ['paused', 'deleted'],
  deleted: [],
} as const;

export function canTransitionVehicleModeration(from: VehicleModerationStatus, to: VehicleModerationStatus): boolean {
  return (vehicleModerationTransitions[from] as readonly string[]).includes(to);
}

export function canTransitionVehicleVisibility(from: VehicleVisibility, to: VehicleVisibility): boolean {
  return (vehicleVisibilityTransitions[from] as readonly string[]).includes(to);
}

export function vehicleReviewTargetStatus(decision: VehicleReviewDecision): VehicleModerationStatus {
  switch (decision) {
    case 'start_review': return 'pending_review';
    case 'approve': return 'approved';
    case 'reject': return 'rejected';
    case 'suspend': return 'suspended';
    case 'restore': return 'approved';
  }
}

export type DiscoverabilityInput = {
  moderationStatus: VehicleModerationStatus;
  visibility: VehicleVisibility;
  hasApprovedSnapshot: boolean;
};

export function computeDiscoverable(input: DiscoverabilityInput): boolean {
  if (input.visibility === 'deleted') return false;
  if (input.moderationStatus === 'approved' && input.visibility === 'active') return true;
  return false;
}

export function ownerMayCreateVehicle(verificationStatus: string | null): boolean {
  return verificationStatus === 'approved';
}

export function ownerMayManageVehicle(vehicleOwnerId: string, actorUid: string): boolean {
  return vehicleOwnerId === actorUid;
}

export type RevisionInput = {
  specs?: Record<string, unknown>;
  ownerDailyRateKobo?: number;
  areaLabel?: string;
  baseAddress?: Record<string, unknown>;
  exactBase?: Record<string, unknown>;
  plate?: string;
  primaryImageId?: string;
  imageOrder?: unknown[];
};

export type RevisionClass = 'minor' | 'major';

export function classifyRevision(input: RevisionInput): { classification: RevisionClass; safetyCritical: boolean } {
  const hasMajor = !!(
    input.specs && (
      (input.specs as Record<string, unknown>).make !== undefined ||
      (input.specs as Record<string, unknown>).model !== undefined ||
      (input.specs as Record<string, unknown>).year !== undefined ||
      (input.specs as Record<string, unknown>).colour !== undefined ||
      (input.specs as Record<string, unknown>).category !== undefined ||
      (input.specs as Record<string, unknown>).seats !== undefined ||
      (input.specs as Record<string, unknown>).transmission !== undefined ||
      (input.specs as Record<string, unknown>).mileageKm !== undefined ||
      (input.specs as Record<string, unknown>).fuelType !== undefined
    )
  ) ||
    input.ownerDailyRateKobo !== undefined;

  const hasSafetyCritical = !!(
    input.areaLabel !== undefined ||
    input.baseAddress !== undefined ||
    input.exactBase !== undefined ||
    input.plate !== undefined ||
    input.primaryImageId !== undefined ||
    input.imageOrder !== undefined
  );

  const classification: RevisionClass = (hasMajor || hasSafetyCritical) ? 'major' : 'minor';
  return { classification, safetyCritical: hasSafetyCritical };
}

export function roundToApproxLatLng(lat: number, lng: number): { lat: number; lng: number } {
  return {
    lat: Math.round(lat * 100) / 100,
    lng: Math.round(lng * 100) / 100,
  };
}

export function maskNigerianPlate(plate: string): string {
  const trimmed = plate.trim().toUpperCase();
  if (trimmed.length < 5) return '****';
  const last2 = trimmed.slice(-2);
  return `***${last2}`;
}

export type TermsSnapshot = {
  ownerTermsVersion: string;
  commissionTermsVersion: string;
  privacyNoticeVersion: string;
};

export function isCurrentTerms(
  terms: TermsSnapshot,
  current: TermsSnapshot,
): boolean {
  return (
    terms.ownerTermsVersion === current.ownerTermsVersion &&
    terms.commissionTermsVersion === current.commissionTermsVersion &&
    terms.privacyNoticeVersion === current.privacyNoticeVersion
  );
}

export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 0 || atIndex === trimmed.length - 1) {
    throw new TypeError('Invalid email address for masking.');
  }
  const firstChar = trimmed[0];
  const domain = trimmed.slice(atIndex + 1);
  return `${firstChar}***@${domain}`;
}

export function maskPhoneE164(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed.startsWith('+234') || trimmed.length < 8) {
    throw new TypeError('Invalid Nigerian E.164 phone number for masking.');
  }
  const suffix = trimmed.slice(-4);
  return `+234****${suffix}`;
}
