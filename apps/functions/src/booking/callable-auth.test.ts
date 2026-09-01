import { describe, expect, it } from 'vitest';

import {
  requireCheckoutRenter,
  requirePaidBookingActor,
  requireVerifiedRenter,
} from './callable-auth.js';
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

describe('requireCheckoutRenter', () => {
  it('requires verified email and Firebase-verified phone evidence', () => {
    expect(() => requireCheckoutRenter(undefined))
      .toThrowError(expect.objectContaining<Partial<BookingCommandError>>({ code: 'UNAUTHENTICATED' }));
    expect(() => requireCheckoutRenter({
      uid: 'renter-one',
      token: { email_verified: false, email: 'renter@example.com', phone_number: '+2348012345678' },
    })).toThrowError(expect.objectContaining<Partial<BookingCommandError>>({ code: 'FORBIDDEN' }));
    expect(() => requireCheckoutRenter({
      uid: 'renter-one',
      token: { email_verified: true, email: 'renter@example.com' },
    })).toThrowError(expect.objectContaining<Partial<BookingCommandError>>({ code: 'PROFILE_INCOMPLETE' }));
  });

  it('returns normalized verified checkout identity', () => {
    expect(requireCheckoutRenter({
      uid: 'renter-one',
      token: {
        email_verified: true,
        email: ' RENTER@EXAMPLE.COM ',
        phone_number: '+2348012345678',
      },
    })).toEqual({
      uid: 'renter-one',
      email: 'renter@example.com',
      phoneNumber: '+2348012345678',
    });
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
