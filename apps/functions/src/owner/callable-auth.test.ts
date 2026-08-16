import { describe, expect, it } from 'vitest';

import {
  requireAuthenticatedUser,
  requireLinkedNigerianPhone,
  requireVerificationAdmin,
  requireVerifiedEmailOwnerAuth,
} from './callable-auth.js';

describe('owner callable-auth helpers', () => {
  describe('requireAuthenticatedUser', () => {
    it('throws UNAUTHENTICATED when auth is undefined or missing uid', () => {
      expect(() => requireAuthenticatedUser(undefined)).toThrowError(/Sign in/);
      expect(() => requireAuthenticatedUser({ uid: '', token: {} })).toThrowError(/Sign in/);
    });

    it('returns uid when valid', () => {
      expect(requireAuthenticatedUser({ uid: 'owner-123', token: {} })).toBe('owner-123');
    });
  });

  describe('requireVerifiedEmailOwnerAuth', () => {
    it('throws UNAUTHENTICATED when auth is missing', () => {
      expect(() => requireVerifiedEmailOwnerAuth(undefined)).toThrowError(/Sign in/);
    });

    it('throws FORBIDDEN email_unverified when email_verified is false', () => {
      expect(() =>
        requireVerifiedEmailOwnerAuth({
          uid: 'owner-123',
          token: { email: 'test@example.com', email_verified: false },
        }),
      ).toThrowError(/Verify your email/);
    });

    it('throws FORBIDDEN email_unverified when email is missing or empty', () => {
      expect(() =>
        requireVerifiedEmailOwnerAuth({
          uid: 'owner-123',
          token: { email_verified: true },
        }),
      ).toThrowError(/Email address is missing/);
    });

    it('returns verified email context without phone when phone is not set', () => {
      const result = requireVerifiedEmailOwnerAuth({
        uid: 'owner-123',
        token: { email: 'owner@example.com', email_verified: true },
      });
      expect(result).toEqual({
        uid: 'owner-123',
        email: 'owner@example.com',
      });
    });

    it('extracts valid Nigerian phone when present on token', () => {
      const result = requireVerifiedEmailOwnerAuth({
        uid: 'owner-123',
        token: {
          email: 'owner@example.com',
          email_verified: true,
          phone_number: '+2348012345678',
        },
      });
      expect(result).toEqual({
        uid: 'owner-123',
        email: 'owner@example.com',
        phoneE164: '+2348012345678',
      });
    });

    it('ignores invalid or foreign phone without error during profile completion', () => {
      const result = requireVerifiedEmailOwnerAuth({
        uid: 'owner-123',
        token: {
          email: 'owner@example.com',
          email_verified: true,
          phone_number: '+14155552671',
        },
      });
      expect(result).toEqual({
        uid: 'owner-123',
        email: 'owner@example.com',
      });
    });
  });

  describe('requireLinkedNigerianPhone', () => {
    it('throws UNAUTHENTICATED when auth is missing', () => {
      expect(() => requireLinkedNigerianPhone(undefined)).toThrowError(/Sign in/);
    });

    it('throws FORBIDDEN phone_unverified when phone_number is missing or foreign', () => {
      expect(() =>
        requireLinkedNigerianPhone({
          uid: 'owner-123',
          token: { email_verified: true },
        }),
      ).toThrowError(/Link a Nigerian phone number/);

      expect(() =>
        requireLinkedNigerianPhone({
          uid: 'owner-123',
          token: { phone_number: '+14155552671' },
        }),
      ).toThrowError(/Link a Nigerian phone number/);
    });

    it('succeeds with valid Nigerian phone when identities array is absent (emulator mode)', () => {
      const phone = requireLinkedNigerianPhone({
        uid: 'owner-123',
        token: { phone_number: '+2348012345678' },
      });
      expect(phone).toBe('+2348012345678');
    });

    it('succeeds when phone_number is listed in firebase.identities.phone', () => {
      const phone = requireLinkedNigerianPhone({
        uid: 'owner-123',
        token: {
          phone_number: '+2348012345678',
          firebase: {
            identities: {
              phone: ['+2348012345678'],
            },
          },
        },
      });
      expect(phone).toBe('+2348012345678');
    });

    it('throws when phone_number is not in firebase.identities.phone', () => {
      expect(() =>
        requireLinkedNigerianPhone({
          uid: 'owner-123',
          token: {
            phone_number: '+2348012345678',
            firebase: {
              identities: {
                phone: ['+2348099999999'],
              },
            },
          },
        }),
      ).toThrowError(/not linked as an identity/);
    });
  });

  describe('requireVerificationAdmin', () => {
    it('throws UNAUTHENTICATED when auth is missing', () => {
      expect(() => requireVerificationAdmin(undefined)).toThrowError(/Sign in/);
    });

    it('throws FORBIDDEN not_staff when no staff claims exist', () => {
      expect(() =>
        requireVerificationAdmin({
          uid: 'user-123',
          token: {},
        }),
      ).toThrowError(/Staff authorization required/);
    });

    it('returns verification_admin role when claim is present', () => {
      const result = requireVerificationAdmin({
        uid: 'staff-123',
        token: { verification_admin: true },
      });
      expect(result).toEqual({ uid: 'staff-123', role: 'verification_admin' });
    });

    it('returns super_admin role when claim is present', () => {
      const result = requireVerificationAdmin({
        uid: 'staff-admin',
        token: { super_admin: true },
      });
      expect(result).toEqual({ uid: 'staff-admin', role: 'super_admin' });
    });

    it('super_admin wins when both claims are set', () => {
      const result = requireVerificationAdmin({
        uid: 'staff-both',
        token: { verification_admin: true, super_admin: true },
      });
      expect(result).toEqual({ uid: 'staff-both', role: 'super_admin' });
    });
  });
});
