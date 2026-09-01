import {
  paymentEnvironmentSchema,
  paymentGatewayInitializeResultSchema,
  paymentGatewayVerifyResultSchema,
  paystackTransactionStatusSchema,
  type PaymentEnvironment,
  type PaymentGatewayInitializeInput,
  type PaymentGatewayInitializeResult,
  type PaymentGatewayVerifyInput,
  type PaymentGatewayVerifyResult,
} from '@mmg/contracts/payment';
import { z } from 'zod';

import { BookingCommandError } from './errors.js';
import type { PaymentGateway } from './payment-gateway.js';

const initializeResponseSchema = z.object({
  status: z.boolean(),
  message: z.string().default(''),
  data: z.object({
    authorization_url: z.string().url(),
    access_code: z.string().min(1),
    reference: z.string().min(1),
  }).passthrough().optional(),
}).passthrough();

const verifyResponseSchema = z.object({
  status: z.boolean(),
  message: z.string().default(''),
  data: z.object({
    domain: paymentEnvironmentSchema,
    status: paystackTransactionStatusSchema,
    reference: z.string().min(1),
    amount: z.number().int().positive(),
    currency: z.string().trim().length(3),
    paid_at: z.string().nullable().optional(),
    gateway_response: z.string().nullable().optional(),
  }).passthrough().optional(),
}).passthrough();

export type PaystackPaymentAdapterOptions = {
  secretKey?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
  requiredEnvironment?: PaymentEnvironment;
};

/**
 * Server-only Paystack adapter.
 *
 * This adapter normalizes provider responses only. It never decides that MMG
 * should deliver booking value. The trusted payment processor must separately
 * validate reference, status, currency and exact expected amount.
 */
export class PaystackPaymentAdapter implements PaymentGateway {
  private readonly secretKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly requiredEnvironment?: PaymentEnvironment;

  constructor(options: PaystackPaymentAdapterOptions = {}) {
    this.secretKey = options.secretKey ?? process.env.PAYSTACK_SECRET_KEY ?? '';
    this.baseUrl = (options.baseUrl ?? 'https://api.paystack.co').replace(/\/$/, '');
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.requiredEnvironment = options.requiredEnvironment;
  }

  async initializePayment(
    input: PaymentGatewayInitializeInput,
  ): Promise<PaymentGatewayInitializeResult> {
    const environment = this.requireEnvironment();

    const response = await this.request(`${this.baseUrl}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: input.email,
        amount: input.amountKobo,
        currency: input.currency,
        reference: input.reference,
        ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}),
        metadata: {
          intentId: input.metadata.intentId,
          platform: 'mmg_concierge',
        },
      }),
    });

    const payload = initializeResponseSchema.safeParse(await this.readJson(response));
    if (!payload.success) {
      throw new BookingCommandError('INTERNAL', 'Paystack returned an invalid initialization response.');
    }

    if (!response.ok || !payload.data.status || !payload.data.data) {
      throw new BookingCommandError(
        'FAILED_PRECONDITION',
        'Paystack could not initialize checkout.',
      );
    }

    if (payload.data.data.reference !== input.reference) {
      throw new BookingCommandError(
        'FAILED_PRECONDITION',
        'Paystack returned a payment reference that does not match the initialized booking payment.',
      );
    }

    return paymentGatewayInitializeResultSchema.parse({
      provider: 'paystack',
      reference: payload.data.data.reference,
      authorizationUrl: payload.data.data.authorization_url,
      accessCode: payload.data.data.access_code,
      environment,
    });
  }

  async verifyPayment(input: PaymentGatewayVerifyInput): Promise<PaymentGatewayVerifyResult> {
    const expectedEnvironment = this.requireEnvironment();

    const response = await this.request(
      `${this.baseUrl}/transaction/verify/${encodeURIComponent(input.reference)}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.secretKey}` },
      },
    );

    const payload = verifyResponseSchema.safeParse(await this.readJson(response));
    if (!payload.success) {
      throw new BookingCommandError('INTERNAL', 'Paystack returned an invalid verification response.');
    }

    if (!response.ok || !payload.data.status || !payload.data.data) {
      throw new BookingCommandError(
        'FAILED_PRECONDITION',
        'Paystack could not verify the transaction.',
      );
    }

    const transaction = payload.data.data;
    if (transaction.domain !== expectedEnvironment) {
      throw new BookingCommandError(
        'FAILED_PRECONDITION',
        'Paystack transaction environment does not match the configured server environment.',
      );
    }

    const paidAtIso = transaction.paid_at ?? undefined;

    return paymentGatewayVerifyResultSchema.parse({
      provider: 'paystack',
      reference: transaction.reference,
      providerStatus: transaction.status,
      environment: transaction.domain,
      amountKobo: transaction.amount,
      currency: transaction.currency,
      ...(paidAtIso ? { paidAtIso } : {}),
      ...(transaction.gateway_response
        ? { gatewayResponse: transaction.gateway_response }
        : {}),
    });
  }

  private requireEnvironment(): PaymentEnvironment {
    if (!this.secretKey) {
      throw new BookingCommandError(
        'CONFIGURATION_UNAVAILABLE',
        'Paystack is not configured on the server.',
      );
    }

    let environment: PaymentEnvironment;
    if (this.secretKey.startsWith('sk_test_')) {
      environment = 'test';
    } else if (this.secretKey.startsWith('sk_live_')) {
      environment = 'live';
    } else {
      throw new BookingCommandError(
        'CONFIGURATION_UNAVAILABLE',
        'Paystack server configuration is invalid.',
      );
    }

    if (this.requiredEnvironment && environment !== this.requiredEnvironment) {
      throw new BookingCommandError(
        'CONFIGURATION_UNAVAILABLE',
        `Paystack ${environment} credentials are not permitted in this runtime.`,
      );
    }

    return environment;
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchFn(url, init);
    } catch {
      throw new BookingCommandError(
        'FAILED_PRECONDITION',
        'Paystack is temporarily unavailable.',
      );
    }
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new BookingCommandError('INTERNAL', 'Paystack returned a non-JSON response.');
    }
  }
}
