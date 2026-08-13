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
