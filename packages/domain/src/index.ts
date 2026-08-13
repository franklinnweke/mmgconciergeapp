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
