import { describe, expect, it } from 'vitest';

import {
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
  });
});
