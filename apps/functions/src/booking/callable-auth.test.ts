import { describe, expect, it } from 'vitest';

import { requirePaidBookingActor, requireVerifiedRenter } from './callable-auth.js';
import type { BookingCommandError } from './errors.js';

describe('requireVerifiedRenter', () => {
  it('rejects missing authentication', () => {
    expect(() => requireVerifiedRenter(undefined))
      .toThrowError(expect.objectContaining<Partial<BookingCommandError>>({ code: 'UNAUTHENTICATED' }));
  });

  it('rejects an unverified email identity', () => {
    expect(() => requireVerifiedRenter({ uid: 'renter-one', token: { email_verified: false } }))
      .toThrowError(expect.objectContaining<Partial<BookingCommandError>>({ code: 'FORBIDDEN' }));
  });

  it('returns the uid for a verified identity', () => {
    expect(requireVerifiedRenter({ uid: 'renter-one', token: { email_verified: true } }))
      .toBe('renter-one');
  });
});

describe('requirePaidBookingActor', () => {
  it('requires authentication and a verified email', () => {
    expect(() => requirePaidBookingActor(undefined))
      .toThrowError(expect.objectContaining<Partial<BookingCommandError>>({ code: 'UNAUTHENTICATED' }));
    expect(() => requirePaidBookingActor({ uid: 'owner-one', token: { email_verified: false } }))
      .toThrowError(expect.objectContaining<Partial<BookingCommandError>>({ code: 'FORBIDDEN' }));
  });

  it('trusts only the super_admin token claim and leaves ownership to the service', () => {
    expect(requirePaidBookingActor({
      uid: 'owner-one',
      token: { email_verified: true, vehicle_admin: true },
    })).toEqual({ uid: 'owner-one', isSuperAdmin: false });
    expect(requirePaidBookingActor({
      uid: 'staff-one',
      token: { email_verified: true, super_admin: true },
    })).toEqual({ uid: 'staff-one', isSuperAdmin: true });
  });
});
