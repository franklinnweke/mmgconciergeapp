import { paidBookingStateSchema } from '@mmg/contracts';
import { allPaidBookingStates, canTransitionPaidBooking } from '@mmg/domain';
import { describe, expect, it } from 'vitest';

/**
 * `@mmg/contracts` and `@mmg/domain` are independent packages — neither imports
 * the other — so the wire enum and the transition map can drift silently. They
 * have. This suite lives in `apps/functions`, the first consumer that imports
 * both, and fails the build when they disagree.
 *
 * A state the wire accepts but the machine does not know is a booking that can
 * never move again. A state the machine knows but the wire rejects is a
 * transition that can never be requested.
 */
describe('paid booking state parity between contracts and domain', () => {
  const wireStates = paidBookingStateSchema.options;

  it('accepts exactly the states the transition map defines', () => {
    expect([...wireStates].sort()).toEqual([...allPaidBookingStates].sort());
  });

  it('parses every state the transition map can reach', () => {
    for (const state of allPaidBookingStates) {
      expect(paidBookingStateSchema.safeParse(state).success).toBe(true);
    }
  });

  it('gives every wire state at least one legal predecessor or is the entry state', () => {
    for (const state of wireStates) {
      if (state === 'paid_pending_owner') continue;
      const hasPredecessor = allPaidBookingStates.some((from) =>
        canTransitionPaidBooking(from, state),
      );
      expect(hasPredecessor, `no transition leads to ${state}`).toBe(true);
    }
  });

  it('keeps completion two-step, matching architecture handoff §7.4', () => {
    expect(paidBookingStateSchema.safeParse('completion_pending').success).toBe(true);
    expect(canTransitionPaidBooking('in_progress', 'completed')).toBe(false);
    expect(canTransitionPaidBooking('in_progress', 'completion_pending')).toBe(true);
    expect(canTransitionPaidBooking('completion_pending', 'completed')).toBe(true);
  });
});
