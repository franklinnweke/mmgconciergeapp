import { describe, expect, it } from 'vitest';

import { createFixtureAdminBookingGateway } from './fixture-admin-booking-gateway';

describe('fixture admin booking gateway', () => {
  it('updates an actionable record without mutating the exported fixtures', async () => {
    const gateway = createFixtureAdminBookingGateway();
    const booking = (await gateway.listBookings())[0];
    await expect(gateway.confirmBooking(booking.id)).resolves.toMatchObject({ state: 'confirmed' });
    await expect(gateway.confirmBooking(booking.id)).rejects.toThrow('no longer actionable');
  });

  it('routes rejection to intervention instead of pretending cancellation/refund completed', async () => {
    const gateway = createFixtureAdminBookingGateway();
    const booking = (await gateway.listBookings())[0];
    const result = await gateway.rejectBooking(booking.id, 'Owner cannot complete the requested dates.');
    expect(result.state).toBe('intervention_required');
    expect(result.timeline.at(-1)?.eventType).toContain('Owner cannot complete');
  });
});
