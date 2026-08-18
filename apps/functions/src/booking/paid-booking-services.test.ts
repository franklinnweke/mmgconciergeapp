import { describe, expect, it } from 'vitest';

import { adminInterveneBooking } from './admin-intervene-booking-service.js';
import type {
  BlockingInterval,
  BookingAuditEvent,
  BookingNotificationOutbox,
  BookingRepository,
  BookingTransaction,
  NewIntentRecord,
  StoredAvailabilityBlock,
  StoredBookingRecord,
  StoredIdempotency,
  TrustedBookingConfig,
  TrustedVehicle,
} from './booking-repository.js';
import { ownerConfirmBooking } from './owner-confirm-booking-service.js';
import { ownerRejectBooking } from './owner-reject-booking-service.js';
import { processPaidBookingEvent } from './process-paid-booking-event-service.js';
import { renterCancelBooking } from './renter-cancel-booking-service.js';
import { staffConfirmBooking } from './staff-confirm-booking-service.js';
import { staffRejectBooking } from './staff-reject-booking-service.js';

function createMockBookingHarness() {
  const intents = new Map<string, NewIntentRecord>();
  const bookings = new Map<string, StoredBookingRecord>();
  const blocks: StoredAvailabilityBlock[] = [];
  const auditEvents: BookingAuditEvent[] = [];
  const notifications: BookingNotificationOutbox[] = [];
  const idempotencyStore = new Map<string, StoredIdempotency>();

  const vehicles = new Map<string, TrustedVehicle>([
    [
      'veh-01',
      {
        id: 'veh-01',
        ownerId: 'owner-1',
        active: true,
        ownerDailyRateKobo: 30_000_000,
        vehicleSnapshot: {
          displayName: 'Toyota Prado 2024',
          areaLabel: 'Ikoyi',
          categoryLabel: 'Executive SUV',
        },
      },
    ],
    [
      'veh-02',
      {
        id: 'veh-02',
        ownerId: 'owner-2',
        active: true,
        ownerDailyRateKobo: 30_000_000,
        vehicleSnapshot: {
          displayName: 'Toyota Land Cruiser 300',
          areaLabel: 'Victoria Island',
          categoryLabel: 'Executive SUV',
        },
      },
    ],
  ]);

  const tx: BookingTransaction = {
    getIdempotency: async (id: string) => idempotencyStore.get(id) ?? null,
    getVehicle: async (id: string) => vehicles.get(id) ?? null,
    getBookingConfig: async () => null,
    readAvailabilitySentinel: async () => {},
    writeAvailabilitySentinel: () => {},
    listBlockingIntervals: async (vId: string) =>
      blocks
        .filter((b) => b.vehicleId === vId)
        .map((b) => ({
          blockId: b.blockId,
          startDate: b.startDate,
          endDate: b.endDate,
          state: b.type === 'booked' ? 'confirmed' : b.type === 'held' ? 'held' : 'owner_block',
          type: b.type,
          expiresAt: b.expiresAt,
        })),
    getAvailabilityBlocksInWindow: async (vId: string) => blocks.filter((b) => b.vehicleId === vId),
    createAvailabilityBlock: (block: StoredAvailabilityBlock) => {
      blocks.push(block);
    },
    removeAvailabilityBlock: (vId: string, bId: string) => {
      const idx = blocks.findIndex((b) => b.blockId === bId);
      if (idx >= 0) blocks.splice(idx, 1);
    },
    getAvailabilityBlock: async (id: string) => blocks.find((b) => b.blockId === id) ?? null,
    getIntent: async (id: string) => intents.get(id) ?? null,
    createIntent: (record: NewIntentRecord) => {
      intents.set(record.intentId, record);
    },
    updateIntent: (record: NewIntentRecord) => {
      intents.set(record.intentId, record);
    },
    getBooking: async (id: string) => bookings.get(id) ?? null,
    createBooking: (record: StoredBookingRecord) => {
      bookings.set(record.bookingId, record);
    },
    updateBooking: (record: StoredBookingRecord) => {
      bookings.set(record.bookingId, record);
    },
    updateHeldBlockToBooked: (intentId: string, bookingId: string, now: Date) => {
      const b = blocks.find((item) => item.referenceId === intentId && item.type === 'held');
      if (b) {
        b.type = 'booked';
        b.referenceId = bookingId;
        b.updatedAt = now;
        delete b.expiresAt;
      }
    },
    releaseHeldBlock: (intentId: string) => {
      const idx = blocks.findIndex((item) => item.referenceId === intentId);
      if (idx >= 0) blocks.splice(idx, 1);
    },
    createAuditEvent: (event: BookingAuditEvent) => {
      auditEvents.push(event);
    },
    createNotificationOutbox: (item: BookingNotificationOutbox) => {
      notifications.push(item);
    },
    saveIdempotency: (id: string, hash: string, res: unknown) => {
      idempotencyStore.set(id, { requestHash: hash, result: res });
    },
  };

  const repository: BookingRepository = {
    runTransaction: async (callback) => callback(tx),
  };

  return { repository, intents, bookings, blocks, auditEvents, notifications };
}

describe('WP4 Paid Booking Lifecycle Services', () => {
  const now = new Date('2026-08-18T10:00:00Z');

  const samplePriceSnapshot = {
    currency: 'NGN' as const,
    chargedDays: 3,
    ownerDailyRateKobo: 30_000_000,
    baseRentalKobo: 90_000_000,
    deliveryFeeKobo: 2_000_000,
    serviceFeeBps: 800,
    serviceFeeFixedKobo: 0,
    serviceFeeKobo: 7_200_000,
    ownerCommissionBps: 1500,
    ownerCommissionKobo: 13_500_000,
    ownerEarningsKobo: 76_500_000,
    renterTotalKobo: 99_200_000,
    configVersion: '2026-08-01',
    termsVersion: '2026-08-01',
    cancellationPolicyVersion: '2026-08-01',
  };

  it('progresses booking from payment.succeeded to paid_pending_owner', async () => {
    const harness = createMockBookingHarness();
    const intent: NewIntentRecord = {
      intentId: 'intent-001',
      renterId: 'renter-1',
      ownerId: 'owner-1',
      vehicleId: 'veh-01',
      startDate: '2026-09-10',
      endDate: '2026-09-13',
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

    const booking = await processPaidBookingEvent(
      {
        intentId: 'intent-001',
        paymentReference: 'test_ref_001',
        amountKobo: 99_200_000,
        paymentEnvironment: 'test',
        paidAtIso: now.toISOString(),
      },
      {
        repository: harness.repository,
        now: () => now,
      },
    );

    expect(booking.state).toBe('paid_pending_owner');
    expect(booking.version).toBe(1);
    expect(booking.paymentReference).toBe('test_ref_001');
    expect(booking.paymentEnvironment).toBe('test');
    expect(harness.intents.get('intent-001')?.state).toBe('paid');
    expect(harness.notifications).toHaveLength(1);
    expect(harness.notifications[0].recipientId).toBe('owner-1');
  });

  it('allows owner to confirm booking', async () => {
    const harness = createMockBookingHarness();
    const booking: StoredBookingRecord = {
      bookingId: 'book-001',
      intentId: 'intent-001',
      renterId: 'renter-1',
      ownerId: 'owner-1',
      vehicleId: 'veh-01',
      startDate: '2026-09-10',
      endDate: '2026-09-13',
      state: 'paid_pending_owner',
      version: 1,
      priceSnapshot: samplePriceSnapshot,
      vehicleSnapshot: {
        displayName: 'Toyota Prado 2024',
        areaLabel: 'Ikoyi',
        categoryLabel: 'Executive SUV',
      },
      paymentReference: 'test_ref_001',
      paidAmountKobo: 99_200_000,
      paymentEnvironment: 'test',
      paidAt: now,
      createdAt: now,
      updatedAt: now,
    };
    harness.bookings.set('book-001', booking);

    const result = await ownerConfirmBooking(
      {
        schemaVersion: 1,
        idempotencyKey: 'idemp_confirm_000000001',
        data: {
          bookingId: 'book-001',
          expectedVersion: 1,
          chauffeurNotes: 'Assigned driver Emmanuel',
        },
      },
      'owner-1',
      {
        repository: harness.repository,
        now: () => now,
      },
    );

    expect(result.result.state).toBe('confirmed');
    expect(result.result.version).toBe(2);
    expect(harness.bookings.get('book-001')?.state).toBe('confirmed');
    expect(harness.bookings.get('book-001')?.chauffeurNotes).toBe('Assigned driver Emmanuel');
  });

  it('refuses owner confirmation if the actor does not own the vehicle', async () => {
    const harness = createMockBookingHarness();
    const booking: StoredBookingRecord = {
      bookingId: 'book-001',
      intentId: 'intent-001',
      renterId: 'renter-1',
      ownerId: 'owner-1',
      vehicleId: 'veh-01',
      startDate: '2026-09-10',
      endDate: '2026-09-13',
      state: 'paid_pending_owner',
      version: 1,
      priceSnapshot: samplePriceSnapshot,
      vehicleSnapshot: {
        displayName: 'Toyota Prado 2024',
        areaLabel: 'Ikoyi',
        categoryLabel: 'Executive SUV',
      },
      paymentReference: 'test_ref_001',
      paidAmountKobo: 99_200_000,
      paymentEnvironment: 'test',
      paidAt: now,
      createdAt: now,
      updatedAt: now,
    };
    harness.bookings.set('book-001', booking);

    await expect(
      ownerConfirmBooking(
        {
          schemaVersion: 1,
          idempotencyKey: 'idemp_confirm_000000001',
          data: {
            bookingId: 'book-001',
            expectedVersion: 1,
          },
        },
        'different-owner-99',
        {
          repository: harness.repository,
          now: () => now,
        },
      ),
    ).rejects.toThrow('You do not have permission to confirm this booking.');
  });

  it('refuses confirmation when booking is in an illegal state', async () => {
    const harness = createMockBookingHarness();
    const booking: StoredBookingRecord = {
      bookingId: 'book-001',
      intentId: 'intent-001',
      renterId: 'renter-1',
      ownerId: 'owner-1',
      vehicleId: 'veh-01',
      startDate: '2026-09-10',
      endDate: '2026-09-13',
      state: 'cancelled',
      version: 2,
      priceSnapshot: samplePriceSnapshot,
      vehicleSnapshot: {
        displayName: 'Toyota Prado 2024',
        areaLabel: 'Ikoyi',
        categoryLabel: 'Executive SUV',
      },
      paymentReference: 'test_ref_001',
      paidAmountKobo: 99_200_000,
      paymentEnvironment: 'test',
      paidAt: now,
      createdAt: now,
      updatedAt: now,
    };
    harness.bookings.set('book-001', booking);

    await expect(
      ownerConfirmBooking(
        {
          schemaVersion: 1,
          idempotencyKey: 'idemp_confirm_000000001',
          data: {
            bookingId: 'book-001',
            expectedVersion: 2,
          },
        },
        'owner-1',
        {
          repository: harness.repository,
          now: () => now,
        },
      ),
    ).rejects.toThrow('Cannot confirm booking from current state');
  });

  it('allows staff to confirm booking from operations desk regardless of vehicle ownerId', async () => {
    const harness = createMockBookingHarness();
    const booking: StoredBookingRecord = {
      bookingId: 'book-001',
      intentId: 'intent-001',
      renterId: 'renter-1',
      ownerId: 'owner-1',
      vehicleId: 'veh-01',
      startDate: '2026-09-10',
      endDate: '2026-09-13',
      state: 'paid_pending_owner',
      version: 1,
      priceSnapshot: samplePriceSnapshot,
      vehicleSnapshot: {
        displayName: 'Toyota Prado 2024',
        areaLabel: 'Ikoyi',
        categoryLabel: 'Executive SUV',
      },
      paymentReference: 'test_ref_001',
      paidAmountKobo: 99_200_000,
      paymentEnvironment: 'test',
      paidAt: now,
      createdAt: now,
      updatedAt: now,
    };
    harness.bookings.set('book-001', booking);

    const result = await staffConfirmBooking(
      {
        schemaVersion: 1,
        idempotencyKey: 'idemp_staff_confirm_000001',
        data: {
          bookingId: 'book-001',
          expectedVersion: 1,
          adminNotes: 'Confirmed by concierge dispatcher',
        },
      },
      {
        uid: 'staff-ops-1',
        token: { booking_admin: true, email_verified: true },
      },
      {
        repository: harness.repository,
        now: () => now,
      },
    );

    expect(result.result.state).toBe('confirmed');
    expect(result.result.version).toBe(2);
    expect(harness.bookings.get('book-001')?.state).toBe('confirmed');
    expect(harness.bookings.get('book-001')?.adminNotes).toBe('Confirmed by concierge dispatcher');
  });

  it('allows owner to reject booking with reason, moving to intervention_required without auto-refund', async () => {
    const harness = createMockBookingHarness();
    const booking: StoredBookingRecord = {
      bookingId: 'book-001',
      intentId: 'intent-001',
      renterId: 'renter-1',
      ownerId: 'owner-1',
      vehicleId: 'veh-01',
      startDate: '2026-09-10',
      endDate: '2026-09-13',
      state: 'paid_pending_owner',
      version: 1,
      priceSnapshot: samplePriceSnapshot,
      vehicleSnapshot: {
        displayName: 'Toyota Prado 2024',
        areaLabel: 'Ikoyi',
        categoryLabel: 'Executive SUV',
      },
      paymentReference: 'test_ref_001',
      paidAmountKobo: 99_200_000,
      paymentEnvironment: 'test',
      paidAt: now,
      createdAt: now,
      updatedAt: now,
    };
    harness.bookings.set('book-001', booking);

    const result = await ownerRejectBooking(
      {
        schemaVersion: 1,
        idempotencyKey: 'idemp_reject_0000000001',
        data: {
          bookingId: 'book-001',
          expectedVersion: 1,
          reason: 'chauffeur_unavailable' as const,
          details: 'Driver emergency',
        },
      },
      'owner-1',
      {
        repository: harness.repository,
        now: () => now,
      },
    );

    expect(result.result.state).toBe('intervention_required');
    expect(result.result.version).toBe(2);
    expect(harness.bookings.get('book-001')?.state).toBe('intervention_required');
  });

  it('refuses owner rejection when actor is not the vehicle owner', async () => {
    const harness = createMockBookingHarness();
    const booking: StoredBookingRecord = {
      bookingId: 'book-001',
      intentId: 'intent-001',
      renterId: 'renter-1',
      ownerId: 'owner-1',
      vehicleId: 'veh-01',
      startDate: '2026-09-10',
      endDate: '2026-09-13',
      state: 'paid_pending_owner',
      version: 1,
      priceSnapshot: samplePriceSnapshot,
      vehicleSnapshot: {
        displayName: 'Toyota Prado 2024',
        areaLabel: 'Ikoyi',
        categoryLabel: 'Executive SUV',
      },
      paymentReference: 'test_ref_001',
      paidAmountKobo: 99_200_000,
      paymentEnvironment: 'test',
      paidAt: now,
      createdAt: now,
      updatedAt: now,
    };
    harness.bookings.set('book-001', booking);

    await expect(
      ownerRejectBooking(
        {
          schemaVersion: 1,
          idempotencyKey: 'idemp_reject_0000000001',
          data: {
            bookingId: 'book-001',
            expectedVersion: 1,
            reason: 'chauffeur_unavailable' as const,
          },
        },
        'different-owner-2',
        {
          repository: harness.repository,
          now: () => now,
        },
      ),
    ).rejects.toThrow('You do not have permission to reject this booking.');
  });

  it('allows renter to cancel booking with calculated refund tier', async () => {
    const harness = createMockBookingHarness();
    const booking: StoredBookingRecord = {
      bookingId: 'book-001',
      intentId: 'intent-001',
      renterId: 'renter-1',
      ownerId: 'owner-1',
      vehicleId: 'veh-01',
      startDate: '2026-09-10',
      endDate: '2026-09-13',
      state: 'confirmed',
      version: 2,
      priceSnapshot: samplePriceSnapshot,
      vehicleSnapshot: {
        displayName: 'Toyota Prado 2024',
        areaLabel: 'Ikoyi',
        categoryLabel: 'Executive SUV',
      },
      paymentReference: 'test_ref_001',
      paidAmountKobo: 99_200_000,
      paymentEnvironment: 'test',
      paidAt: now,
      createdAt: now,
      updatedAt: now,
    };
    harness.bookings.set('book-001', booking);

    const result = await renterCancelBooking(
      {
        schemaVersion: 1,
        idempotencyKey: 'idemp_cancel_0000000001',
        data: {
          bookingId: 'book-001',
          expectedVersion: 2,
          reason: 'Travel plans changed',
        },
      },
      'renter-1',
      {
        repository: harness.repository,
        now: () => new Date('2026-09-01T12:00:00Z'),
      },
    );

    expect(result.result.state).toBe('cancelled');
    expect(result.result.policyTier).toBe('full_refund');
    expect(result.result.refundKobo).toBe(92_000_000);
    expect(result.result.penaltyKobo).toBe(7_200_000);
  });

  it('allows admin to intervene and reassign vehicle to another approved vehicle', async () => {
    const harness = createMockBookingHarness();
    const booking: StoredBookingRecord = {
      bookingId: 'book-001',
      intentId: 'intent-001',
      renterId: 'renter-1',
      ownerId: 'owner-1',
      vehicleId: 'veh-01',
      startDate: '2026-09-10',
      endDate: '2026-09-13',
      state: 'intervention_required',
      version: 2,
      priceSnapshot: samplePriceSnapshot,
      vehicleSnapshot: {
        displayName: 'Toyota Prado 2024',
        areaLabel: 'Ikoyi',
        categoryLabel: 'Executive SUV',
      },
      paymentReference: 'test_ref_001',
      paidAmountKobo: 99_200_000,
      paymentEnvironment: 'test',
      paidAt: now,
      createdAt: now,
      updatedAt: now,
    };
    harness.bookings.set('book-001', booking);

    const result = await adminInterveneBooking(
      {
        schemaVersion: 1,
        idempotencyKey: 'idemp_intervene_00000001',
        data: {
          bookingId: 'book-001',
          expectedVersion: 2,
          action: 'reassign_vehicle' as const,
          targetVehicleId: 'veh-02',
          adminNotes: 'Reassigned to matching LC300 in VI with customer consent.',
        },
      },
      'staff-ops-1',
      {
        repository: harness.repository,
        now: () => now,
      },
    );

    expect(result.result.action).toBe('reassign_vehicle');
    expect(result.result.state).toBe('confirmed');
    expect(result.result.reassignedVehicleId).toBe('veh-02');
    expect(harness.bookings.get('book-001')?.vehicleId).toBe('veh-02');
    expect(harness.bookings.get('book-001')?.reassignedFromVehicleId).toBe('veh-01');
  });
});
