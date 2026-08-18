import type {
  InitializePaymentInput,
  InitializePaymentResult,
  PaymentPort,
  VerifyPaymentInput,
  VerifyPaymentResult,
} from '@mmg/contracts';

/**
 * Test-only payment adapter for emulator and integration suites.
 * STRICT INVARIANT: Must NEVER be invoked by a production route or deployed endpoint.
 */
export class TestPaymentAdapter implements PaymentPort {
  private successfulReferences = new Map<string, { amountKobo: number; paidAtIso: string }>();

  mockSuccessfulPayment(reference: string, amountKobo: number, paidAtIso = new Date().toISOString()): void {
    this.successfulReferences.set(reference, { amountKobo, paidAtIso });
  }

  async initializePayment(input: InitializePaymentInput): Promise<InitializePaymentResult> {
    const reference = `test_pay_ref_${input.intentId}_${Date.now()}`;
    this.mockSuccessfulPayment(reference, input.amountKobo);
    return {
      reference,
      status: 'pending',
      environment: 'test',
      authorizationUrl: `https://checkout.test.mmgconcierge.com/pay/${reference}`,
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    const payment = this.successfulReferences.get(input.reference);
    if (!payment) {
      return {
        reference: input.reference,
        status: 'failed',
        environment: 'test',
        gatewayResponse: 'Test payment reference not found or unmocked.',
      };
    }

    return {
      reference: input.reference,
      status: 'succeeded',
      environment: 'test',
      amountKobo: payment.amountKobo,
      paidAtIso: payment.paidAtIso,
      gatewayResponse: 'Successful test authorization',
    };
  }
}
