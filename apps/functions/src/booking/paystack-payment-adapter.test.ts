import { describe, expect, it, vi } from 'vitest';

import { PaystackPaymentAdapter } from './paystack-payment-adapter.js';

describe('PaystackPaymentAdapter', () => {
  it('throws CONFIGURATION_UNAVAILABLE when secret key is unset or empty', async () => {
    const originalEnv = process.env.PAYSTACK_SECRET_KEY;
    delete process.env.PAYSTACK_SECRET_KEY;

    try {
      const adapter = new PaystackPaymentAdapter({
        secretKey: '',
        fetchFn: vi.fn() as any,
      });

      await expect(
        adapter.initializePayment({
          intentId: 'intent-123',
          amountKobo: 50_000_000,
          email: 'renter@test.com',
        }),
      ).rejects.toThrow('Paystack secret key is not configured on the server.');

      await expect(
        adapter.verifyPayment({
          reference: 'ref-123',
        }),
      ).rejects.toThrow('Paystack secret key is not configured on the server.');
    } finally {
      process.env.PAYSTACK_SECRET_KEY = originalEnv;
    }
  });

  it('derives environment correctly from key prefix (test vs live)', async () => {
    const testAdapter = new PaystackPaymentAdapter({
      secretKey: 'sk_test_1234567890',
      fetchFn: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: true,
          data: { authorization_url: 'https://checkout.paystack.com/test', reference: 'ref-test' },
        }),
      }) as any,
    });

    const testInit = await testAdapter.initializePayment({
      intentId: 'intent-1',
      amountKobo: 10_000_000,
      email: 'a@b.com',
    });
    expect(testInit.environment).toBe('test');

    const liveAdapter = new PaystackPaymentAdapter({
      secretKey: 'sk_live_1234567890',
      fetchFn: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: true,
          data: { authorization_url: 'https://checkout.paystack.com/live', reference: 'ref-live' },
        }),
      }) as any,
    });

    const liveInit = await liveAdapter.initializePayment({
      intentId: 'intent-2',
      amountKobo: 10_000_000,
      email: 'a@b.com',
    });
    expect(liveInit.environment).toBe('live');
  });

  it('initializes a Paystack transaction with authorization url and reference', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: true,
        message: 'Authorization URL created',
        data: {
          authorization_url: 'https://checkout.paystack.com/0123456789',
          access_code: '0123456789',
          reference: 'mmg_intent-123_1720000000',
        },
      }),
    });

    const adapter = new PaystackPaymentAdapter({
      secretKey: 'sk_test_mock_secret_key',
      fetchFn: mockFetch as any,
    });

    const result = await adapter.initializePayment({
      intentId: 'intent-123',
      amountKobo: 50_000_000,
      email: 'renter@test.com',
      callbackUrl: 'https://mmgconcierge.com/payment/callback',
    });

    expect(result.status).toBe('pending');
    expect(result.environment).toBe('test');
    expect(result.authorizationUrl).toBe('https://checkout.paystack.com/0123456789');
    expect(result.reference).toBe('mmg_intent-123_1720000000');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.paystack.co/transaction/initialize',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer sk_test_mock_secret_key',
          'Content-Type': 'application/json',
        },
      }),
    );
  });

  it('verifies a successful Paystack transaction with authentic gateway amount', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: true,
        message: 'Verification successful',
        data: {
          status: 'success',
          reference: 'mmg_intent-123_1720000000',
          amount: 50_000_000,
          paid_at: '2026-08-18T10:00:00.000Z',
          gateway_response: 'Successful',
        },
      }),
    });

    const adapter = new PaystackPaymentAdapter({
      secretKey: 'sk_test_mock_secret_key',
      fetchFn: mockFetch as any,
    });

    const result = await adapter.verifyPayment({
      reference: 'mmg_intent-123_1720000000',
    });

    expect(result.status).toBe('succeeded');
    expect(result.environment).toBe('test');
    expect(result.amountKobo).toBe(50_000_000);
    expect(result.reference).toBe('mmg_intent-123_1720000000');
  });

  it('fails closed when Paystack returns an unsuccessful transaction', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: true,
        message: 'Verification completed',
        data: {
          status: 'failed',
          reference: 'mmg_intent-123_1720000000',
          amount: 50_000_000,
          gateway_response: 'Declined by issuer',
        },
      }),
    });

    const adapter = new PaystackPaymentAdapter({
      secretKey: 'sk_test_mock_secret_key',
      fetchFn: mockFetch as any,
    });

    const result = await adapter.verifyPayment({
      reference: 'mmg_intent-123_1720000000',
    });

    expect(result.status).toBe('failed');
    expect(result.environment).toBe('test');
  });
});
