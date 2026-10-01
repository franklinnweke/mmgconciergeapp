import { describe, expect, it, vi } from 'vitest';

import { FirestoreOwnerEarningsRepository } from './firestore-owner-earnings-repository.js';
import {
  confirmBookingCompletion,
  progressBookingLifecycle,
  reportTripEnded,
  setOwnerSettlementHold,
} from './owner-earnings-service.js';

describe('owner earnings service', () => {
  it('validates reportTripEnded command and invokes repository', async () => {
    const mockRepo = {
      reportTripEnded: vi.fn().mockResolvedValue({
        bookingId: 'booking-123',
        state: 'completion_pending' as const,
        version: 2,
      }),
    } as unknown as FirestoreOwnerEarningsRepository;

    const result = await reportTripEnded(
      {
        schemaVersion: 1,
        data: { bookingId: 'booking-123' },
      },
      { uid: 'owner-123' },
      { repository: mockRepo },
    );

    expect(result.state).toBe('completion_pending');
    expect(mockRepo.reportTripEnded).toHaveBeenCalledWith('booking-123', { uid: 'owner-123' }, expect.any(Date));
  });

  it('rejects invalid reportTripEnded command', async () => {
    const mockRepo = {} as FirestoreOwnerEarningsRepository;

    await expect(
      reportTripEnded(
        { schemaVersion: 1, data: {} },
        { uid: 'owner-123' },
        { repository: mockRepo },
      ),
    ).rejects.toThrow();
  });

  it('validates confirmBookingCompletion command and invokes repository', async () => {
    const mockRepo = {
      confirmBookingCompletion: vi.fn().mockResolvedValue({
        bookingId: 'booking-123',
        bookingState: 'completed' as const,
        earningState: 'available' as const,
        amountKobo: 41000000,
        version: 3,
      }),
    } as unknown as FirestoreOwnerEarningsRepository;

    const result = await confirmBookingCompletion(
      {
        schemaVersion: 1,
        data: { bookingId: 'booking-123' },
      },
      { uid: 'renter-123', isStaff: false },
      { repository: mockRepo },
    );

    expect(result.bookingState).toBe('completed');
    expect(result.earningState).toBe('available');
    expect(mockRepo.confirmBookingCompletion).toHaveBeenCalledWith(
      'booking-123',
      { uid: 'renter-123', isStaff: false },
      expect.any(Date),
    );
  });

  it('validates setOwnerSettlementHold command and invokes repository', async () => {
    const mockRepo = {
      setOwnerSettlementHold: vi.fn().mockResolvedValue({
        ownerId: 'owner-123',
        settlementHold: true,
        version: 2,
      }),
    } as unknown as FirestoreOwnerEarningsRepository;

    const result = await setOwnerSettlementHold(
      {
        schemaVersion: 1,
        data: { ownerId: 'owner-123', hold: true, reason: 'Payment dispute' },
      },
      { uid: 'admin-1', role: 'finance_admin' },
      { repository: mockRepo },
    );

    expect(result.settlementHold).toBe(true);
    expect(mockRepo.setOwnerSettlementHold).toHaveBeenCalledWith(
      { ownerId: 'owner-123', hold: true, reason: 'Payment dispute' },
      { uid: 'admin-1', role: 'finance_admin' },
      expect.any(Date),
    );
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
