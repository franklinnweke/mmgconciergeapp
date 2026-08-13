import { describe, expect, it } from 'vitest';

import {
  emailPasswordRegistrationSchema,
  emailPasswordSignInSchema,
} from './index';

describe('authentication contracts', () => {
  it('normalizes a valid email/password sign-in request', () => {
    expect(
      emailPasswordSignInSchema.parse({
        email: '  RENTER@Example.com ',
        password: 'private-passphrase',
      }),
    ).toEqual({
      email: 'renter@example.com',
      password: 'private-passphrase',
    });
  });

  it('rejects weak credentials and oversized names', () => {
    expect(() =>
      emailPasswordRegistrationSchema.parse({
        displayName: 'A'.repeat(81),
        email: 'not-an-email',
        password: 'short',
      }),
    ).toThrow();
  });
});
