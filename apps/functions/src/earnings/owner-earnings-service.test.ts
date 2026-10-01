import { describe, expect, it, vi } from 'vitest';

import { FirestoreOwnerEarningsRepository } from './firestore-owner-earnings-repository.js';
import {
  confirmBookingCompletion,
  progressBookingLifecycle,
  reportTripEnded,
  setOwnerSettlementHold,
} from './owner-earnings-service.js';

describe('owner earnings service', () => {
  it('validates reportTripEnded command and invokes repository with idempotency parameters', async () => {
    const mockRepo = {
      reportTripEnded: vi.fn().mockResolvedValue({
        requestId: 'req-test-123',
        result: {
          bookingId: 'booking-123',
          state: 'completion_pending' as const,
          version: 2,
        },
      }),
    } as unknown as FirestoreOwnerEarningsRepository;

    const result = await reportTripEnded(
      {
        schemaVersion: 1,
        idempotencyKey: 'idem-report-ended-001',
        data: { bookingId: 'booking-123' },
      },
      { uid: 'owner-123' },
      { repository: mockRepo, createRequestId: () => 'req-test-123' },
    );

    expect(result.requestId).toBe('req-test-123');
    expect(result.result.state).toBe('completion_pending');
    expect(mockRepo.reportTripEnded).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: 'booking-123',
        actor: { uid: 'owner-123' },
        commandRequestId: 'req-test-123',
        idempotencyDocumentId: expect.any(String),
        requestHash: expect.any(String),
      }),
    );
  });

  it('rejects malformed reportTripEnded command with INVALID_ARGUMENT CommandError', async () => {
    const mockRepo = {} as FirestoreOwnerEarningsRepository;

    await expect(
      reportTripEnded(
        { schemaVersion: 1, data: {} },
        { uid: 'owner-123' },
        { repository: mockRepo },
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
  });

  it('validates confirmBookingCompletion command and invokes repository with idempotency parameters', async () => {
    const mockRepo = {
      confirmBookingCompletion: vi.fn().mockResolvedValue({
        requestId: 'req-confirm-123',
        result: {
          bookingId: 'booking-123',
          bookingState: 'completed' as const,
          earningState: 'available' as const,
          amountKobo: 41000000,
          version: 3,
        },
      }),
    } as unknown as FirestoreOwnerEarningsRepository;

    const result = await confirmBookingCompletion(
      {
        schemaVersion: 1,
        idempotencyKey: 'idem-confirm-complete-001',
        data: { bookingId: 'booking-123' },
      },
      { uid: 'renter-123', isStaff: false },
      { repository: mockRepo, createRequestId: () => 'req-confirm-123' },
    );

    expect(result.requestId).toBe('req-confirm-123');
    expect(result.result.bookingState).toBe('completed');
    expect(result.result.earningState).toBe('available');
    expect(mockRepo.confirmBookingCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: 'booking-123',
        actor: { uid: 'renter-123', isStaff: false },
        commandRequestId: 'req-confirm-123',
        idempotencyDocumentId: expect.any(String),
        requestHash: expect.any(String),
      }),
    );
  });

  it('rejects malformed confirmBookingCompletion command with INVALID_ARGUMENT CommandError', async () => {
    const mockRepo = {} as FirestoreOwnerEarningsRepository;

    await expect(
      confirmBookingCompletion(
        { schemaVersion: 1, data: { bookingId: '' } },
        { uid: 'renter-123', isStaff: false },
        { repository: mockRepo },
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
  });

  it('validates setOwnerSettlementHold command and invokes repository with idempotency parameters', async () => {
    const mockRepo = {
      setOwnerSettlementHold: vi.fn().mockResolvedValue({
        requestId: 'req-hold-123',
        result: {
          ownerId: 'owner-123',
          settlementHold: true,
          version: 2,
        },
      }),
    } as unknown as FirestoreOwnerEarningsRepository;

    const result = await setOwnerSettlementHold(
      {
        schemaVersion: 1,
        idempotencyKey: 'idem-settlement-hold-001',
        data: { ownerId: 'owner-123', hold: true, reason: 'Payment dispute' },
      },
      { uid: 'admin-1', role: 'finance_admin' },
      { repository: mockRepo, createRequestId: () => 'req-hold-123' },
    );

    expect(result.requestId).toBe('req-hold-123');
    expect(result.result.settlementHold).toBe(true);
    expect(mockRepo.setOwnerSettlementHold).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'owner-123',
        hold: true,
        reason: 'Payment dispute',
        actor: { uid: 'admin-1', role: 'finance_admin' },
        commandRequestId: 'req-hold-123',
        idempotencyDocumentId: expect.any(String),
        requestHash: expect.any(String),
      }),
    );
  });

  it('rejects malformed setOwnerSettlementHold command with INVALID_ARGUMENT CommandError', async () => {
    const mockRepo = {} as FirestoreOwnerEarningsRepository;

    await expect(
      setOwnerSettlementHold(
        { schemaVersion: 1, data: { ownerId: '' } },
        { uid: 'admin-1', role: 'finance_admin' },
        { repository: mockRepo },
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
  });

  it('invokes progressBookingLifecycle on repository', async () => {
    const mockRepo = {
      progressBookingLifecycle: vi.fn().mockResolvedValue({ scanned: 5, transitioned: 2 }),
    } as unknown as FirestoreOwnerEarningsRepository;

    const result = await progressBookingLifecycle({ repository: mockRepo });
    expect(result.transitioned).toBe(2);
    expect(mockRepo.progressBookingLifecycle).toHaveBeenCalledWith(expect.any(Date), undefined);
  });
});
