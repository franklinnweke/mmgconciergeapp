import { describe, expect, it } from 'vitest';

import { fixtureBookings } from '../data/fixture-admin-booking-gateway';
import { permittedAdminActions, validateRejectionReason } from './admin-booking';

describe('admin booking actions', () => {
  it('allows confirmation and rejection only for verified paid-pending-owner records', () => {
    expect(permittedAdminActions(fixtureBookings[0])).toEqual(['confirm', 'reject']);
    expect(fixtureBookings.slice(1).every((booking) => permittedAdminActions(booking).length === 0)).toBe(true);
  });

  it('requires a bounded, normalized rejection reason', () => {
    expect(validateRejectionReason('  Owner reported a mechanical inspection issue.  '))
      .toBe('Owner reported a mechanical inspection issue.');
    expect(() => validateRejectionReason('too short')).toThrow();
    expect(() => validateRejectionReason('x'.repeat(501))).toThrow();
  });
});
