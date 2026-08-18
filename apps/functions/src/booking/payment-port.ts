import {
  BookingCommandError,
  type InitializePaymentInput,
  type InitializePaymentResult,
  type PaymentPort,
  type VerifyPaymentInput,
  type VerifyPaymentResult,
} from '@mmg/contracts';

/**
 * Production payment adapter.
 * Fail-closed: Paystack is deliberately unavailable in the current milestone (WP4/ADR 0005).
 */
export class ProductionPaymentAdapter implements PaymentPort {
  async initializePayment(_input: InitializePaymentInput): Promise<InitializePaymentResult> {
    throw new BookingCommandError(
      'FAILED_PRECONDITION',
      'Card payment through Paystack is currently unavailable in this release.',
      { reason: 'payment_unavailable' },
    );
  }

  async verifyPayment(_input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    throw new BookingCommandError(
      'FAILED_PRECONDITION',
      'Payment verification is unavailable while Paystack is not integrated.',
      { reason: 'payment_unavailable' },
    );
  }
}
