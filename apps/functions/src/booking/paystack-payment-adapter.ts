import {
  BookingCommandError,
  type InitializePaymentInput,
  type InitializePaymentResult,
  type PaymentPort,
  type VerifyPaymentInput,
  type VerifyPaymentResult,
} from '@mmg/contracts';

export type PaystackPaymentAdapterOptions = {
  secretKey?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
};

/**
 * Paystack payment adapter.
 * Connects to Paystack API (https://api.paystack.co) for server-side payment initialization and verification.
 * Fail-closed: Never bypasses Paystack API or simulates success without real gateway confirmation.
 */
export class PaystackPaymentAdapter implements PaymentPort {
  private readonly secretKey: string;
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;

  constructor(options?: PaystackPaymentAdapterOptions) {
    this.secretKey = options?.secretKey ?? process.env.PAYSTACK_SECRET_KEY ?? '';
    this.baseUrl = options?.baseUrl || 'https://api.paystack.co';
    this.fetch = options?.fetchFn || globalThis.fetch;
  }

  private get environment(): 'test' | 'live' {
    return this.secretKey.startsWith('sk_test_') ? 'test' : 'live';
  }

  async initializePayment(input: InitializePaymentInput): Promise<InitializePaymentResult> {
    if (!this.secretKey) {
      throw new BookingCommandError(
        'CONFIGURATION_UNAVAILABLE',
        'Paystack secret key is not configured on the server.',
      );
    }

    const reference = `mmg_${input.intentId}_${Date.now()}`;
    const callbackUrl = input.callbackUrl || 'https://mmgconcierge.com/payment/callback';

    try {
      const response = await this.fetch(`${this.baseUrl}/transaction/initialize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: input.email,
          amount: input.amountKobo,
          currency: 'NGN',
          reference,
          callback_url: callbackUrl,
          metadata: {
            intentId: input.intentId,
            platform: 'mmg_concierge',
            environment: this.environment,
            custom_fields: [
              {
                display_name: 'Intent ID',
                variable_name: 'intent_id',
                value: input.intentId,
              },
            ],
          },
        }),
      });

      const payload = (await response.json()) as {
        status: boolean;
        message: string;
        data?: {
          authorization_url: string;
          access_code: string;
          reference: string;
        };
      };

      if (!response.ok || !payload.status || !payload.data) {
        throw new BookingCommandError(
          'FAILED_PRECONDITION',
          payload.message || 'Could not initialize payment with Paystack.',
        );
      }

      return {
        reference: payload.data.reference,
        status: 'pending',
        authorizationUrl: payload.data.authorization_url,
        environment: this.environment,
        message: payload.message,
      };
    } catch (error: any) {
      if (error instanceof BookingCommandError) throw error;
      throw new BookingCommandError(
        'INTERNAL',
        `Paystack initialization failed: ${error?.message || 'Network error'}`,
      );
    }
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    if (!this.secretKey) {
      throw new BookingCommandError(
        'CONFIGURATION_UNAVAILABLE',
        'Paystack secret key is not configured on the server.',
      );
    }

    try {
      const response = await this.fetch(
        `${this.baseUrl}/transaction/verify/${encodeURIComponent(input.reference)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        },
      );

      const payload = (await response.json()) as {
        status: boolean;
        message: string;
        data?: {
          status: string;
          reference: string;
          amount: number;
          paid_at?: string;
          gateway_response?: string;
        };
      };

      if (!response.ok || !payload.status || !payload.data) {
        return {
          reference: input.reference,
          status: 'failed',
          environment: this.environment,
          gatewayResponse: payload.message || 'Paystack transaction verification failed.',
        };
      }

      const tx = payload.data;
      const status =
        tx.status === 'success' ? 'succeeded' : tx.status === 'abandoned' ? 'abandoned' : 'failed';

      return {
        reference: tx.reference,
        status,
        environment: this.environment,
        amountKobo: tx.amount,
        paidAtIso: tx.paid_at ? new Date(tx.paid_at).toISOString() : new Date().toISOString(),
        gatewayResponse: tx.gateway_response || payload.message,
      };
    } catch (error: any) {
      return {
        reference: input.reference,
        status: 'failed',
        environment: this.environment,
        gatewayResponse: `Paystack verification connection failed: ${error?.message || 'Network error'}`,
      };
    }
  }
}
