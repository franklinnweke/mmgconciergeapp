import { describe, expect, it, vi } from 'vitest';

import { BookingCommandError } from './errors.js';
import { PaystackPaymentAdapter } from './paystack-payment-adapter.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function adapterWithResponse(body: unknown, options: { status?: number; secretKey?: string } = {}) {
  const fetchMock = vi.fn(
    async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) =>
      jsonResponse(body, options.status ?? 200),
  );
  const adapter = new PaystackPaymentAdapter({
    secretKey: options.secretKey ?? 'sk_test_mmg_unit_test',
    fetchFn: fetchMock as unknown as typeof fetch,
  });
  return { adapter, fetchMock };
}

describe('PaystackPaymentAdapter.initializePayment', () => {
  it('initializes hosted checkout with a server-supplied reference and exposes access code', async () => {
    const { adapter, fetchMock } = adapterWithResponse({
      status: true,
      message: 'Authorization URL created',
      data: {
        authorization_url: 'https://checkout.paystack.com/access-123',
        access_code: 'access-123',
        reference: 'mmg-intent-123',
      },
    });

    await expect(
      adapter.initializePayment({
        reference: 'mmg-intent-123',
        email: 'renter@example.com',
        amountKobo: 12_500_000,
        currency: 'NGN',
        callbackUrl: 'https://mmgconcierge.com/payment/callback',
        metadata: { intentId: 'intent-123' },
      }),
    ).resolves.toEqual({
      provider: 'paystack',
      reference: 'mmg-intent-123',
      authorizationUrl: 'https://checkout.paystack.com/access-123',
      accessCode: 'access-123',
      environment: 'test',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.paystack.co/transaction/initialize');
    expect(init?.method).toBe('POST');
    expect(String(init?.body)).toContain('mmg-intent-123');
    expect(String(init?.body)).toContain('12500000');
  });

  it('fails closed when Paystack returns a different reference', async () => {
    const { adapter } = adapterWithResponse({
      status: true,
      message: 'Authorization URL created',
      data: {
        authorization_url: 'https://checkout.paystack.com/access-123',
        access_code: 'access-123',
        reference: 'unexpected-reference',
      },
    });

    await expect(
      adapter.initializePayment({
        reference: 'expected-reference',
        email: 'renter@example.com',
        amountKobo: 500_000,
        currency: 'NGN',
        metadata: { intentId: 'intent-123' },
      }),
    ).rejects.toMatchObject({ code: 'FAILED_PRECONDITION' });
  });

  it('rejects missing or unrecognized server secret configuration', async () => {
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_ambient_secret_must_be_ignored';
    const noSecret = new PaystackPaymentAdapter({
      fetchFn: vi.fn() as unknown as typeof fetch,
    });
    const badSecret = new PaystackPaymentAdapter({
      secretKey: 'not-a-paystack-secret',
      fetchFn: vi.fn() as unknown as typeof fetch,
    });

    const input = {
      reference: 'reference-123',
      email: 'renter@example.com',
      amountKobo: 500_000,
      currency: 'NGN' as const,
      metadata: { intentId: 'intent-123' },
    };

    await expect(noSecret.initializePayment(input)).rejects.toMatchObject({
      code: 'CONFIGURATION_UNAVAILABLE',
    });
    await expect(badSecret.initializePayment(input)).rejects.toMatchObject({
      code: 'CONFIGURATION_UNAVAILABLE',
    });
    delete process.env.PAYSTACK_SECRET_KEY;
  });

  it('rejects a live key before any network request when the runtime requires test mode', async () => {
    const fetchMock = vi.fn();
    const adapter = new PaystackPaymentAdapter({
      secretKey: 'sk_live_mmg_should_never_run_in_dev',
      requiredEnvironment: 'test',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    await expect(
      adapter.initializePayment({
        reference: 'reference-123',
        email: 'renter@example.com',
        amountKobo: 500_000,
        currency: 'NGN',
        metadata: { intentId: 'intent-123' },
      }),
    ).rejects.toMatchObject({ code: 'CONFIGURATION_UNAVAILABLE' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('PaystackPaymentAdapter.verifyPayment', () => {
  it('preserves Paystack success facts without deciding MMG booking value', async () => {
    const { adapter, fetchMock } = adapterWithResponse({
      status: true,
      message: 'Verification successful',
      data: {
        domain: 'test',
        status: 'success',
        reference: 'mmg-intent-123',
        amount: 12_500_000,
        currency: 'ngn',
        paid_at: '2026-08-31T05:00:00.000Z',
        gateway_response: 'Successful',
      },
    });

    await expect(adapter.verifyPayment({ reference: 'mmg-intent-123' })).resolves.toEqual({
      provider: 'paystack',
      reference: 'mmg-intent-123',
      providerStatus: 'success',
      environment: 'test',
      amountKobo: 12_500_000,
      currency: 'NGN',
      paidAtIso: '2026-08-31T05:00:00.000Z',
      gatewayResponse: 'Successful',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.paystack.co/transaction/verify/mmg-intent-123',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('preserves non-success provider statuses for the trusted processor to interpret', async () => {
    const { adapter } = adapterWithResponse({
      status: true,
      message: 'Verification successful',
      data: {
        domain: 'test',
        status: 'pending',
        reference: 'mmg-intent-pending',
        amount: 900_000,
        currency: 'NGN',
        paid_at: null,
        gateway_response: 'Pending',
      },
    });

    const result = await adapter.verifyPayment({ reference: 'mmg-intent-pending' });
    expect(result.providerStatus).toBe('pending');
    expect(result).not.toHaveProperty('paidAtIso');
  });

  it('fails closed on provider environment mismatch', async () => {
    const { adapter } = adapterWithResponse({
      status: true,
      message: 'Verification successful',
      data: {
        domain: 'live',
        status: 'success',
        reference: 'mmg-intent-123',
        amount: 12_500_000,
        currency: 'NGN',
      },
    });

    await expect(adapter.verifyPayment({ reference: 'mmg-intent-123' })).rejects.toMatchObject({
      code: 'FAILED_PRECONDITION',
    });
  });

  it('fails closed on malformed or unavailable Paystack responses', async () => {
    const malformed = adapterWithResponse({ status: true, data: { status: 'mystery' } });
    await expect(malformed.adapter.verifyPayment({ reference: 'reference-123' })).rejects.toBeInstanceOf(
      BookingCommandError,
    );

    const fetchMock = vi.fn(
      async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => {
        throw new Error('network down');
      },
    );
    const unavailable = new PaystackPaymentAdapter({
      secretKey: 'sk_test_mmg_unit_test',
      fetchFn: fetchMock as unknown as typeof fetch,
    });
    await expect(unavailable.verifyPayment({ reference: 'reference-123' })).rejects.toMatchObject({
      code: 'FAILED_PRECONDITION',
    });
  });
});
