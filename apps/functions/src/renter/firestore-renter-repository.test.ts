import { describe, expect, it } from 'vitest';

import { parseRenterProfileDocument } from './firestore-renter-repository.js';

const VALID_PROFILE = {
  renterId: 'renter-1',
  fullName: 'Babatunde Adeleke',
  email: 'renter@example.com',
  phone: '+2348012345678',
  defaultDeliveryAddress: {
    streetAddress: '15 Queens Drive, Ikoyi',
    areaLabel: 'Ikoyi',
  },
  acceptedRenterTermsVersion: '2026-03-01',
  acceptedPrivacyNoticeVersion: '2026-03-01',
  accountStatus: 'active',
  deletionReason: null,
  deletionRequestedAt: null,
  profileVersion: 2,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-15T10:00:00.000Z',
};

describe('parseRenterProfileDocument', () => {
  it('parses a complete authoritative renter profile', () => {
    expect(parseRenterProfileDocument('renter-1', VALID_PROFILE)).toMatchObject({
      renterId: 'renter-1',
      accountStatus: 'active',
      profileVersion: 2,
      acceptedRenterTermsVersion: '2026-03-01',
    });
  });

  it.each([
    ['missing account status', { accountStatus: undefined }],
    ['missing renter terms', { acceptedRenterTermsVersion: undefined }],
    ['missing privacy terms', { acceptedPrivacyNoticeVersion: undefined }],
    ['missing profile version', { profileVersion: undefined }],
    ['zero profile version', { profileVersion: 0 }],
    ['missing created timestamp', { createdAt: undefined }],
    ['missing updated timestamp', { updatedAt: undefined }],
    ['missing renter id', { renterId: undefined }],
  ])('fails closed for %s', (_label, override) => {
    expect(() => parseRenterProfileDocument('renter-1', {
      ...VALID_PROFILE,
      ...override,
    })).toThrow();
  });

  it('fails closed when the stored renter ID does not match the document path', () => {
    expect(() => parseRenterProfileDocument('renter-1', {
      ...VALID_PROFILE,
      renterId: 'another-renter',
    })).toThrow(/does not match/);
  });

  it('normalizes Firestore-like timestamp objects without inventing current time', () => {
    const profile = parseRenterProfileDocument('renter-1', {
      ...VALID_PROFILE,
      createdAt: { toDate: () => new Date('2026-09-01T10:00:00.000Z') },
      updatedAt: { toDate: () => new Date('2026-09-15T10:00:00.000Z') },
    });
    expect(profile.createdAt).toBe('2026-09-01T10:00:00.000Z');
    expect(profile.updatedAt).toBe('2026-09-15T10:00:00.000Z');
  });
});
