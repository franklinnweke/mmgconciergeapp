import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WebBookingPaymentGateway } from './booking-payment-gateway.web';

const mockHttpsCallable = vi.fn();

vi.mock('firebase/app', () => ({
  getApp: vi.fn(() => ({})),
}));

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn((_functions, name) => {
    return (args: any) => mockHttpsCallable(name, args);
  }),
}));

describe('WebBookingPaymentGateway', () => {
  let gateway: WebBookingPaymentGateway;

  beforeEach(() => {
    vi.clearAllMocks();
    gateway = new WebBookingPaymentGateway();
  });

  it('creates booking intent through Cloud Function', async () => {
    mockHttpsCallable.mockResolvedValueOnce({
      data: {
        requestId: 'req-1',
        result: {
          intentId: 'intent-123',
          state: 'intent_created',
        },
      },
    });

    const result = await gateway.createBookingIntent({
      vehicleId: 'veh-1',
      startDate: '2026-08-20',
      endDate: '2026-08-23',
    });

    expect(result.intentId).toBe('intent-123');
    expect(mockHttpsCallable).toHaveBeenCalledWith(
      'createBookingIntent',
      expect.objectContaining({
        schemaVersion: 1,
        data: {
          vehicleId: 'veh-1',
          startDate: '2026-08-20',
          endDate: '2026-08-23',
        },
      }),
    );
  });

  it('initializes booking payment through Cloud Function', async () => {
    mockHttpsCallable.mockResolvedValueOnce({
      data: {
        requestId: 'req-init',
        result: {
          intentId: 'intent-123',
          reference: 'ref-123',
          authorizationUrl: 'https://checkout.paystack.com/xyz',
          environment: 'test',
        },
      },
    });

    const result = await gateway.initializePayment({
      intentId: 'intent-123',
    });

    expect(result.reference).toBe('ref-123');
    expect(result.authorizationUrl).toBe('https://checkout.paystack.com/xyz');
  });

  it('verifies payment and receives confirmed booking', async () => {
    mockHttpsCallable.mockResolvedValueOnce({
      data: {
        requestId: 'req-2',
        result: {
          bookingId: 'booking-999',
          intentId: 'intent-123',
          state: 'paid_pending_owner',
          renterTotalKobo: 50_000_000,
          paymentReference: 'ref-123',
          createdAt: '2026-08-18T10:00:00.000Z',
          updatedAt: '2026-08-18T10:00:00.000Z',
        },
      },
    });

    const result = await gateway.verifyPayment({
      intentId: 'intent-123',
      paymentReference: 'ref-123',
    });

    expect(result.bookingId).toBe('booking-999');
    expect(result.state).toBe('paid_pending_owner');
  });
});
