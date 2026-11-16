import type { ThemeColors } from '@mmg/brand';

/**
 * Single foreground/background pairing for the critical renter checkout CTAs
 * (Booking Review "Send request" and Paystack "Pay securely"). Keeping it in one
 * place means a token change cannot silently regress one button but not the other.
 */
export function checkoutCtaColors(colors: ThemeColors) {
  return { background: colors.goldStrong, foreground: colors.primaryContrast } as const;
}
