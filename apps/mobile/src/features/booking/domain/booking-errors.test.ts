import { describe, expect, it } from 'vitest';
import { bookingCommandErrorMessage } from './booking-errors';

describe('bookingCommandErrorMessage', () => {
  it('maps unsafe internal exceptions to safe copy', () => {
    const message = bookingCommandErrorMessage(new Error('Internal Firestore trace /secret'));
    expect(message).not.toContain('Firestore');
    expect(message).toContain('No charge was attempted');
  });
  it('maps overlap and network failures', () => {
    expect(bookingCommandErrorMessage({ details: { code: 'VEHICLE_UNAVAILABLE', reason: 'dates_overlap' } })).toContain('Choose different dates');
    expect(bookingCommandErrorMessage({ code: 'network-request-failed' })).toContain('connection');
  });
});
