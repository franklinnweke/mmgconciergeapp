import { describe, expect, it, vi } from 'vitest';

import {
  BookingCommandError,
  initializeBookingPaymentCommandSchema,
  verifyBookingPaymentCommandSchema,
  type PaymentPort,
} from '@mmg/contracts';

import type {
  BookingAuditEvent,
  BookingNotificationOutbox,
  BookingRepository,
  BookingTransaction,
  NewIntentRecord,
  StoredAvailabilityBlock,
  StoredBookingRecord,
  StoredIdempotency,
} from './booking-repository.js';
import { initializeBookingPayment } from './initialize-booking-payment-service.js';
import { verifyBookingPayment } from './verify-booking-payment-service.js';

function createMockPaymentHarness() {
  const intents = new Map<string, NewIntentRecord>();
  const bookings = new Map<string, StoredBookingRecord>();
  const blocks: StoredAvailabilityBlock[] = [];
  const auditEvents: BookingAuditEvent[] = [];
  const notifications: BookingNotificationOutbox[] = [];
  const idempotencyStore = new Map<string, StoredIdempotency>();

  const tx: BookingTransaction = {
    getIdempotency: async (id: string) => idempotencyStore.get(id) ?? null,
    getVehicle: async () => null,
    getBookingConfig: async () => null,
    readAvailabilitySentinel: async () => {},
    writeAvailabilitySentinel: () => {},
    listBlockingIntervals: async () => [],
    getAvailabilityBlocksInWindow: async () => [],
    createAvailabilityBlock: (b) => { blocks.push(b); },
    removeAvailabilityBlock: () => {},
    getAvailabilityBlock: async () => null,
    getIntent: async (id: string) => intents.get(id) ?? null,
    createIntent: (record: NewIntentRecord) => { intents.set(record.intentId, record); },
    updateIntent: (record: NewIntentRecord) => { intents.set(record.intentId, record); },
    getBooking: async (id: string) => bookings.get(id) ?? null,
    createBooking: (record: StoredBookingRecord) => { bookings.set(record.bookingId, record); },
    updateBooking: (record: StoredBookingRecord) => { bookings.set(record.bookingId, record); },
    updateHeldBlockToBooked: (intentId: string, bookingId: string, now: Date) => {
      const b = blocks.find((item) => item.referenceId === intentId && item.type === 'held');
      if (b) {
        b.type = 'booked';
        b.referenceId = bookingId;
        b.updatedAt = now;
      }
    },
    releaseHeldBlock: () => {},
    createAuditEvent: (event) => { auditEvents.push(event); },
    createNotificationOutbox: (item) => { notifications.push(item); },
    saveIdempotency: (id, hash, res) => { idempotencyStore.set(id, { requestHash: hash, result: res }); },
  };

  const repository: BookingRepository = {
    runTransaction: async (cb) => cb(tx),
  };

  return { repository, intents, bookings, blocks, auditEvents, notifications };
}

describe('Booking Payment Services (Initialize & Verify)', () => {
  const now = new Date('2026-08-18T10:00:00Z');
  const samplePriceSnapshot = {
    currency: 'NGN' as const,
    chargedDays: 2,
    ownerDailyRateKobo: 25_000_000,
    baseRentalKobo: 50_000_000,
    deliveryFeeKobo: 2_000_000,
    serviceFeeBps: 800,
    serviceFeeFixedKobo: 0,
    serviceFeeKobo: 4_000_000,
    ownerCommissionBps: 1500,
    ownerCommissionKobo: 7_500_000,
    ownerEarningsKobo: 42_500_000,
    renterTotalKobo: 56_000_000,
    configVersion: '2026-08-01',
    termsVersion: '2026-08-01',
    cancellationPolicyVersion: '2026-08-01',
  };

  it('rejects command payloads attempting to inject simulateTestSuccess (strict schema)', () => {
    const maliciousVerify = {
      schemaVersion: 1,
      idempotencyKey: 'idemp_verify_000000001',
      data: {
        intentId: 'intent-001',
        paymentReference: 'ref_123',
        simulateTestSuccess: true,
      },
    };
    expect(verifyBookingPaymentCommandSchema.safeParse(maliciousVerify).success).toBe(false);

    const maliciousInit = {
      schemaVersion: 1,
      idempotencyKey: 'idemp_init_0000000001',
      data: {
        intentId: 'intent-001',
        amountKobo: 100,
      },
    };
    expect(initializeBookingPaymentCommandSchema.safeParse(maliciousInit).success).toBe(false);
  });

  it('initializes booking payment with server-derived amount and email', async () => {
    const harness = createMockPaymentHarness();
    const intent: NewIntentRecord = {
      intentId: 'intent-001',
      renterId: 'renter-1',
      ownerId: 'owner-1',
      vehicleId: 'veh-01',
      startDate: '2026-09-10',
      endDate: '2026-09-12',
      state: 'intent_created',
      priceSnapshot: samplePriceSnapshot,
      vehicleSnapshot: {
        displayName: 'Toyota Prado 2024',
        areaLabel: 'Ikoyi',
        categoryLabel: 'Executive SUV',
      },
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date('2026-08-18T10:15:00Z'),
    };
    harness.intents.set('intent-001', intent);

    const mockPaymentPort: PaymentPort = {
      initializePayment: vi.fn().mockResolvedValue({
        reference: 'ref_paystack_001',
        status: 'pending',
        authorizationUrl: 'https://checkout.paystack.com/xyz',
        environment: 'test',
      }),
      verifyPayment: vi.fn(),
    };

    const result = await initializeBookingPayment(
      {
        schemaVersion: 1,
        idempotencyKey: 'idemp_init_0000000001',
        data: { intentId: 'intent-001' },
      },
      {
        uid: 'renter-1',
        token: { email: 'renter@test.com', email_verified: true },
      },
      {
        repository: harness.repository,
        paymentPort: mockPaymentPort,
        now: () => now,
      },
    );

    expect(result.result.reference).toBe('ref_paystack_001');
    expect(result.result.authorizationUrl).toBe('https://checkout.paystack.com/xyz');
    expect(mockPaymentPort.initializePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        intentId: 'intent-001',
        amountKobo: 56_000_000,
        email: 'renter@test.com',
      }),
    );

    const updatedIntent = harness.intents.get('intent-001');
    expect(updatedIntent?.state).toBe('checkout_pending');
    expect(updatedIntent?.paymentReference).toBe('ref_paystack_001');
  });

  it('refuses initialization when caller is not the intent renter', async () => {
    const harness = createMockPaymentHarness();
    const intent: NewIntentRecord = {
      intentId: 'intent-001',
      renterId: 'renter-1',
      ownerId: 'owner-1',
      vehicleId: 'veh-01',
      startDate: '2026-09-10',
      endDate: '2026-09-12',
      state: 'intent_created',
      priceSnapshot: samplePriceSnapshot,
      vehicleSnapshot: {
        displayName: 'Toyota Prado 2024',
        areaLabel: 'Ikoyi',
        categoryLabel: 'Executive SUV',
      },
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date('2026-08-18T10:15:00Z'),
    };
    harness.intents.set('intent-001', intent);

    await expect(
      initializeBookingPayment(
        {
          schemaVersion: 1,
          idempotencyKey: 'idemp_init_0000000001',
          data: { intentId: 'intent-001' },
        },
        {
          uid: 'different-renter-2',
          token: { email: 'different@test.com', email_verified: true },
        },
        {
          repository: harness.repository,
          paymentPort: { initializePayment: vi.fn(), verifyPayment: vi.fn() },
          now: () => now,
        },
      ),
    ).rejects.toThrow('You are not authorized to initialize payment for this booking intent.');
  });

  it('refuses initialization when booking intent hold has expired', async () => {
    const harness = createMockPaymentHarness();
    const intent: NewIntentRecord = {
      intentId: 'intent-001',
      renterId: 'renter-1',
      ownerId: 'owner-1',
      vehicleId: 'veh-01',
      startDate: '2026-09-10',
      endDate: '2026-09-12',
      state: 'intent_created',
      priceSnapshot: samplePriceSnapshot,
      vehicleSnapshot: {
        displayName: 'Toyota Prado 2024',
        areaLabel: 'Ikoyi',
        categoryLabel: 'Executive SUV',
      },
      createdAt: new Date('2026-08-18T09:00:00Z'),
      updatedAt: new Date('2026-08-18T09:00:00Z'),
      expiresAt: new Date('2026-08-18T09:15:00Z'), // Expired relative to now (10:00:00Z)
    };
    harness.intents.set('intent-001', intent);

    await expect(
      initializeBookingPayment(
        {
          schemaVersion: 1,
          idempotencyKey: 'idemp_init_0000000001',
          data: { intentId: 'intent-001' },
        },
        {
          uid: 'renter-1',
          token: { email: 'renter@test.com', email_verified: true },
        },
        {
          repository: harness.repository,
          paymentPort: { initializePayment: vi.fn(), verifyPayment: vi.fn() },
          now: () => now,
        },
      ),
    ).rejects.toThrow('Booking intent date hold has expired.');
  });

  it('rejects verifyBookingPayment when payment reference does not match intent', async () => {
    const harness = createMockPaymentHarness();
    const intent: NewIntentRecord = {
      intentId: 'intent-001',
      renterId: 'renter-1',
      ownerId: 'owner-1',
      vehicleId: 'veh-01',
      startDate: '2026-09-10',
      endDate: '2026-09-12',
      state: 'checkout_pending',
      paymentReference: 'ref_paystack_001',
      priceSnapshot: samplePriceSnapshot,
      vehicleSnapshot: {
        displayName: 'Toyota Prado 2024',
        areaLabel: 'Ikoyi',
        categoryLabel: 'Executive SUV',
      },
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date('2026-08-18T10:15:00Z'),
    };
    harness.intents.set('intent-001', intent);

    const mockPaymentPort: PaymentPort = {
      initializePayment: vi.fn(),
      verifyPayment: vi.fn().mockResolvedValue({
        reference: 'different_ref_999',
        status: 'succeeded',
        amountKobo: 56_000_000,
        environment: 'test',
      }),
    };

    await expect(
      verifyBookingPayment(
        {
          schemaVersion: 1,
          idempotencyKey: 'idemp_verify_000000001',
          data: {
            intentId: 'intent-001',
            paymentReference: 'different_ref_999',
          },
        },
        {
          uid: 'renter-1',
          token: { email: 'renter@test.com', email_verified: true },
        },
        {
          repository: harness.repository,
          paymentPort: mockPaymentPort,
          now: () => now,
        },
      ),
    ).rejects.toThrow('Payment reference does not match the reference initialized for this booking intent.');
  });

  it('rejects verifyBookingPayment when Paystack verification does not succeed', async () => {
    const harness = createMockPaymentHarness();
    const intent: NewIntentRecord = {
      intentId: 'intent-001',
      renterId: 'renter-1',
      ownerId: 'owner-1',
      vehicleId: 'veh-01',
      startDate: '2026-09-10',
      endDate: '2026-09-12',
      state: 'checkout_pending',
      paymentReference: 'ref_paystack_001',
      priceSnapshot: samplePriceSnapshot,
      vehicleSnapshot: {
        displayName: 'Toyota Prado 2024',
        areaLabel: 'Ikoyi',
        categoryLabel: 'Executive SUV',
      },
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date('2026-08-18T10:15:00Z'),
    };
    harness.intents.set('intent-001', intent);

    const mockPaymentPort: PaymentPort = {
      initializePayment: vi.fn(),
      verifyPayment: vi.fn().mockResolvedValue({
        reference: 'ref_paystack_001',
        status: 'failed',
        environment: 'test',
        gatewayResponse: 'Declined by issuer',
      }),
    };

    await expect(
      verifyBookingPayment(
        {
          schemaVersion: 1,
          idempotencyKey: 'idemp_verify_000000001',
          data: {
            intentId: 'intent-001',
            paymentReference: 'ref_paystack_001',
          },
        },
        {
          uid: 'renter-1',
          token: { email: 'renter@test.com', email_verified: true },
        },
        {
          repository: harness.repository,
          paymentPort: mockPaymentPort,
          now: () => now,
        },
      ),
    ).rejects.toThrow('Declined by issuer');

    expect(harness.bookings.size).toBe(0);
  });

  it('strictly verifies payment with Paystack and creates paid booking', async () => {
    const harness = createMockPaymentHarness();
    const intent: NewIntentRecord = {
      intentId: 'intent-001',
      renterId: 'renter-1',
      ownerId: 'owner-1',
      vehicleId: 'veh-01',
      startDate: '2026-09-10',
      endDate: '2026-09-12',
      state: 'checkout_pending',
      paymentReference: 'ref_paystack_001',
      priceSnapshot: samplePriceSnapshot,
      vehicleSnapshot: {
        displayName: 'Toyota Prado 2024',
        areaLabel: 'Ikoyi',
        categoryLabel: 'Executive SUV',
      },
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date('2026-08-18T10:15:00Z'),
    };
    harness.intents.set('intent-001', intent);

    const mockPaymentPort: PaymentPort = {
      initializePayment: vi.fn(),
      verifyPayment: vi.fn().mockResolvedValue({
        reference: 'ref_paystack_001',
        status: 'succeeded',
        amountKobo: 56_000_000,
        paidAtIso: '2026-08-18T10:05:00.000Z',
        environment: 'test',
      }),
    };

    const result = await verifyBookingPayment(
      {
        schemaVersion: 1,
        idempotencyKey: 'idemp_verify_000000001',
        data: {
          intentId: 'intent-001',
          paymentReference: 'ref_paystack_001',
        },
      },
      {
        uid: 'renter-1',
        token: { email: 'renter@test.com', email_verified: true },
      },
      {
        repository: harness.repository,
        paymentPort: mockPaymentPort,
        now: () => now,
      },
    );

    expect(result.result.state).toBe('paid_pending_owner');
    expect(result.result.paymentReference).toBe('ref_paystack_001');
    expect(result.result.paymentEnvironment).toBe('test');
    expect(harness.intents.get('intent-001')?.state).toBe('paid');
  });
});
