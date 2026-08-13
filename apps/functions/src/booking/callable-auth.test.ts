import { describe, expect, it } from 'vitest';

import { requireVerifiedRenter } from './callable-auth.js';
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
