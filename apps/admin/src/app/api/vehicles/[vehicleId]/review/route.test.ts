import { beforeEach, describe, expect, it, vi } from 'vitest';

const { executeReviewVehicleAction } = vi.hoisted(() => ({
  executeReviewVehicleAction: vi.fn(),
}));

vi.mock('@/features/vehicles/data/review-vehicle-action', () => ({
  executeReviewVehicleAction,
}));

import { POST } from './route';

describe('POST /api/vehicles/[vehicleId]/review', () => {
  beforeEach(() => {
    executeReviewVehicleAction.mockReset();
  });

  it('does not expose an unexpected internal error', async () => {
    executeReviewVehicleAction.mockRejectedValueOnce(
      new Error('SECRET_FIRESTORE_TOKEN_AND_STACK_DETAILS'),
    );

    const response = await POST(
      new Request('http://localhost/api/vehicles/vehicle-1/review', {
        method: 'POST',
        body: JSON.stringify({ decision: 'approve', expectedVersion: 2 }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ vehicleId: 'vehicle-1' }) },
    );

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('The vehicle review action could not be completed. Please try again.');
    expect(body.error).not.toContain('SECRET_FIRESTORE_TOKEN_AND_STACK_DETAILS');
  });

  it('rejects a request without a valid decision and expected version', async () => {
    const response = await POST(
      new Request('http://localhost/api/vehicles/vehicle-1/review', {
        method: 'POST',
        body: JSON.stringify({ decision: 'approve', expectedVersion: 0 }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ vehicleId: 'vehicle-1' }) },
    );

    expect(response.status).toBe(400);
    expect(executeReviewVehicleAction).not.toHaveBeenCalled();
  });
});
