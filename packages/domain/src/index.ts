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

  const rentalKobo = dailyRateKobo * durationDays;
  const serviceFeeKobo = Math.round(rentalKobo * 0.08);

  return {
    durationDays,
    rentalKobo,
    serviceFeeKobo,
    totalKobo: rentalKobo + serviceFeeKobo,
  };
}
