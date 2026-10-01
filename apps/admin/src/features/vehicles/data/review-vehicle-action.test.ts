import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandError } from '@mmg/contracts';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers({ origin: 'http://localhost' })),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const mockReviewVehicle = vi.fn();
vi.mock('@mmg/functions-vehicle/review-vehicle-service', () => ({
  reviewVehicle: (...args: unknown[]) => mockReviewVehicle(...args),
}));

vi.mock('@/features/auth/server/firebase-admin', () => ({
  getAdminFirestore: vi.fn().mockReturnValue({}),
  getAdminStorage: vi.fn().mockReturnValue({ bucket: vi.fn().mockReturnValue({}) }),
}));
vi.mock('@mmg/functions-vehicle/firestore-vehicle-repository', () => ({
  FirestoreVehicleRepository: vi.fn(),
}));
vi.mock('@mmg/functions-vehicle/vehicle-storage-gateway', () => ({
  AdminVehicleStorageGateway: vi.fn(),
}));
vi.mock('@/features/auth/server/same-origin', () => ({
  assertSameOrigin: vi.fn(),
}));

const mockSession = {
  uid: 'staff-admin-1',
  email: 'staff@mmgconcierge.com',
  role: 'super_admin',
};

const mockStaffActorRole = vi.fn().mockReturnValue('super_admin');
const mockStaffSessionHasCapability = vi.fn().mockReturnValue(true);
const mockRequireLiveStaffSession = vi.fn().mockResolvedValue(mockSession);

vi.mock('@/features/auth/server/session', () => ({
  requireLiveStaffSession: () => mockRequireLiveStaffSession(),
  staffActorRole: (...args: unknown[]) => mockStaffActorRole(...args),
  staffSessionHasCapability: (...args: unknown[]) => mockStaffSessionHasCapability(...args),
}));

import { executeReviewVehicleAction } from './review-vehicle-action';

describe('executeReviewVehicleAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStaffActorRole.mockReturnValue('super_admin');
    mockStaffSessionHasCapability.mockReturnValue(true);
    mockRequireLiveStaffSession.mockResolvedValue(mockSession);
  });

  const validChecklist = {
    images_complete_and_legible: true,
    specs_match_images: true,
    plate_matches_documents: true,
    lagos_base_plausible: true,
    rate_plausible: true,
    chauffeur_delivery_included: true,
    no_fraud_indicators: true,
  };

  it('successfully approves vehicle and returns decision details', async () => {
    mockReviewVehicle.mockResolvedValueOnce({
      result: {
        toStatus: 'approved',
        decidedAt: '2026-09-30T10:00:00.000Z',
      },
    });

    const result = await executeReviewVehicleAction({
      vehicleId: 'veh-1',
      expectedVersion: 1,
      decision: 'approve',
      checklist: validChecklist,
    });

    expect(result).toEqual({
      success: true,
      toStatus: 'approved',
      decidedAt: '2026-09-30T10:00:00.000Z',
    });
  });

  it('maps INVALID_STATE_TRANSITION to safe truthful error message', async () => {
    mockReviewVehicle.mockRejectedValueOnce(
      new CommandError('INVALID_STATE_TRANSITION', 'Cannot transition vehicle from "approved" to "approved".'),
    );

    const result = await executeReviewVehicleAction({
      vehicleId: 'veh-1',
      expectedVersion: 8,
      decision: 'approve',
      checklist: validChecklist,
    });

    expect(result).toEqual({
      success: false,
      error: "This action is not valid for the vehicle's current state. Refresh the record and try again.",
    });
  });

  it('maps FAILED_PRECONDITION with stale_version to safe refresh message', async () => {
    mockReviewVehicle.mockRejectedValueOnce(
      new CommandError('FAILED_PRECONDITION', 'Vehicle was modified by another operation. Please refresh.', {
        reason: 'stale_version',
      }),
    );

    const result = await executeReviewVehicleAction({
      vehicleId: 'veh-1',
      expectedVersion: 1,
      decision: 'approve',
      checklist: validChecklist,
    });

    expect(result).toEqual({
      success: false,
      error: 'This vehicle changed. Refresh the record and try again.',
    });
  });

  it('maps NOT_FOUND to safe not-available message', async () => {
    mockReviewVehicle.mockRejectedValueOnce(
      new CommandError('NOT_FOUND', 'Vehicle listing not found.'),
    );

    const result = await executeReviewVehicleAction({
      vehicleId: 'veh-1',
      expectedVersion: 1,
      decision: 'approve',
      checklist: validChecklist,
    });

    expect(result).toEqual({
      success: false,
      error: 'That vehicle listing is no longer available.',
    });
  });

  it('maps FORBIDDEN with not_staff reason to safe unauthorized message', async () => {
    mockReviewVehicle.mockRejectedValueOnce(
      new CommandError('FORBIDDEN', 'User is not staff.', { reason: 'not_staff' }),
    );

    const result = await executeReviewVehicleAction({
      vehicleId: 'veh-1',
      expectedVersion: 1,
      decision: 'approve',
      checklist: validChecklist,
    });

    expect(result).toEqual({
      success: false,
      error: 'You are not authorized to review vehicle listings.',
    });
  });

  it('maps IDEMPOTENCY_CONFLICT to safe conflict message', async () => {
    mockReviewVehicle.mockRejectedValueOnce(
      new CommandError('IDEMPOTENCY_CONFLICT', 'Idempotency conflict detected.'),
    );

    const result = await executeReviewVehicleAction({
      vehicleId: 'veh-1',
      expectedVersion: 1,
      decision: 'approve',
      checklist: validChecklist,
    });

    expect(result).toEqual({
      success: false,
      error: 'This review request conflicts with an earlier attempt. Refresh and try again.',
    });
  });

  it('maps unexpected exceptions to safe generic error message', async () => {
    mockReviewVehicle.mockRejectedValueOnce(
      new Error('Secret internal database connection timeout at firestore.internal'),
    );

    const result = await executeReviewVehicleAction({
      vehicleId: 'veh-1',
      expectedVersion: 1,
      decision: 'approve',
      checklist: validChecklist,
    });

    expect(result).toEqual({
      success: false,
      error: 'The vehicle review action could not be completed. Please try again.',
    });
  });

  it('returns warning when photo publication fails after decision commits', async () => {
    mockReviewVehicle.mockImplementationOnce(async (_cmd, _actor, deps) => {
      deps.onPromotionFailure?.();
      return {
        result: {
          toStatus: 'approved',
          decidedAt: '2026-09-30T10:00:00.000Z',
        },
      };
    });

    const result = await executeReviewVehicleAction({
      vehicleId: 'veh-1',
      expectedVersion: 1,
      decision: 'approve',
      checklist: validChecklist,
    });

    expect(result).toEqual({
      success: true,
      toStatus: 'approved',
      decidedAt: '2026-09-30T10:00:00.000Z',
      warning:
        'Decision recorded, but the listing photos could not be published. The listing is not yet discoverable — retry from the queue or escalate to engineering.',
    });
  });
});
