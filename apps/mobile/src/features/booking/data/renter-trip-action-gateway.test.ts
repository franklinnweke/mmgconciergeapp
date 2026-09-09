import { describe, expect, it, vi } from 'vitest';

import type { BookingIntentGateway } from './booking-intent-gateway-core';
import {
  createRenterTripActionGateway,
  RenterTripActionUnavailableError,
  unavailableRenterTripActionGateway,
} from './renter-trip-action-gateway';

describe('unavailable renter trip action gateway', () => {
  it('never fakes payment, support, or cancellation success', async () => {
    await expect(unavailableRenterTripActionGateway.perform('payment', 'preview-checkout'))
      .rejects.toBeInstanceOf(RenterTripActionUnavailableError);
    await expect(unavailableRenterTripActionGateway.perform('payment', 'preview-checkout'))
      .rejects.toThrow(/no charge was attempted/i);
    await expect(unavailableRenterTripActionGateway.perform('cancellation', 'preview-paid'))
      .rejects.toThrow(/journey was not changed/i);
    await expect(unavailableRenterTripActionGateway.perform('support', 'preview-intervention'))
      .rejects.toThrow(/no message was sent/i);
    await expect(unavailableRenterTripActionGateway.perform('release_hold', 'preview-held'))
      .rejects.toThrow(/dates are still held/i);
  });
});

describe('createRenterTripActionGateway', () => {
  it('delegates release_hold to intent gateway', async () => {
    const mockRelease = vi.fn().mockResolvedValue({
      requestId: 'req-1',
      result: {
        intentId: 'intent-123',
        releasedAt: '2026-09-09T14:00:00.000Z',
        releasedBlocksCount: 1,
      },
    });
    const fakeIntentGateway: BookingIntentGateway = {
      createIntent: vi.fn(),
      releaseHold: mockRelease,
    };
    const gateway = createRenterTripActionGateway(fakeIntentGateway);
    await gateway.perform('release_hold', 'intent-123');
    expect(mockRelease).toHaveBeenCalledWith('intent-123');
  });

  it('rejects unsupported actions with unavailable error', async () => {
    const fakeIntentGateway: BookingIntentGateway = {
      createIntent: vi.fn(),
      releaseHold: vi.fn(),
    };
    const gateway = createRenterTripActionGateway(fakeIntentGateway);
    await expect(gateway.perform('payment', 'trip-1')).rejects.toBeInstanceOf(
      RenterTripActionUnavailableError,
    );
  });
});
