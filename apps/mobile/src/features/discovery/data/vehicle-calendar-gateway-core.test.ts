import { describe, expect, it } from 'vitest';
import { vehicleCalendarErrorMessage } from './vehicle-calendar-gateway-core';

describe('vehicleCalendarErrorMessage', () => {
  it('never exposes provider internals', () => {
    const message = vehicleCalendarErrorMessage(new Error('Firestore secret trace /internal/path'));
    expect(message).toBe('Availability could not be checked. Try again before reviewing the quote.');
    expect(message).not.toContain('Firestore');
  });
  it('keeps network failure copy distinct', () => {
    expect(vehicleCalendarErrorMessage({ code: 'network-request-failed' })).toContain('connection');
  });
});
