import { describe, expect, it } from 'vitest';

import {
  RenterProfileError,
  normalizeDeliveryAddress,
  normalizeTimestamp,
  parseRenterProfileDocument,
} from './renter-profile-record';

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
  profileVersion: 1,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-15T10:00:00.000Z',
};

describe('normalizeTimestamp', () => {
  it('normalizes ISO string', () => {
    expect(normalizeTimestamp('2026-09-01T10:00:00.000Z')).toBe('2026-09-01T10:00:00.000Z');
  });

  it('normalizes Date object', () => {
    const d = new Date('2026-09-01T10:00:00.000Z');
    expect(normalizeTimestamp(d)).toBe('2026-09-01T10:00:00.000Z');
  });

  it('normalizes Firestore Timestamp with toDate()', () => {
    const ts = { toDate: () => new Date('2026-09-01T10:00:00.000Z') };
    expect(normalizeTimestamp(ts)).toBe('2026-09-01T10:00:00.000Z');
  });

  it('normalizes serialized Firestore Timestamp with seconds and nanoseconds', () => {
    const ts = { seconds: 1788256800, nanoseconds: 0 };
    expect(normalizeTimestamp(ts)).toBe('2026-09-01T10:00:00.000Z');
  });

  it('normalizes serialized Firestore Timestamp with _seconds and _nanoseconds', () => {
    const ts = { _seconds: 1788256800, _nanoseconds: 0 };
    expect(normalizeTimestamp(ts)).toBe('2026-09-01T10:00:00.000Z');
  });

  it('returns invalid value unchanged so downstream schema validator can fail with schema error', () => {
    expect(normalizeTimestamp(12345)).toBe(12345);
  });
});

describe('normalizeDeliveryAddress', () => {
  it('preserves valid delivery address fields', () => {
    const addr = {
      streetAddress: '15 Queens Drive',
      areaLabel: 'Ikoyi',
      buildingNumber: '15B',
      landmark: 'Near Civic Centre',
      placeId: 'place-123',
      approxLatitude: 6.45,
      approxLongitude: 3.42,
    };
    expect(normalizeDeliveryAddress(addr)).toEqual(addr);
  });

  it('strips extraneous fields like city, country, latitude, longitude without losing valid fields', () => {
    const raw = {
      streetAddress: '15 Queens Drive',
      areaLabel: 'Ikoyi',
      city: 'Lagos',
      country: 'NG',
      latitude: 6.45,
      longitude: 3.42,
      extraUnknown: 'foo',
    };
    expect(normalizeDeliveryAddress(raw)).toEqual({
      streetAddress: '15 Queens Drive',
      areaLabel: 'Ikoyi',
    });
  });
});

describe('parseRenterProfileDocument', () => {
  it('parses an authoritative profile and normalizes Firestore timestamps', () => {
    const parsed = parseRenterProfileDocument('renter-1', {
      ...VALID_PROFILE,
      createdAt: { toDate: () => new Date('2026-09-01T10:00:00.000Z') },
      updatedAt: { toDate: () => new Date('2026-09-15T10:00:00.000Z') },
    });

    expect(parsed).toMatchObject({
      renterId: 'renter-1',
      accountStatus: 'active',
      profileVersion: 1,
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-15T10:00:00.000Z',
    });
  });

  it('parses legacy record without optional deletion fields', () => {
    const legacyDoc = { ...VALID_PROFILE };
    delete (legacyDoc as Partial<typeof VALID_PROFILE>).deletionReason;
    delete (legacyDoc as Partial<typeof VALID_PROFILE>).deletionRequestedAt;

    const parsed = parseRenterProfileDocument('renter-1', legacyDoc);
    expect(parsed.deletionReason).toBeNull();
    expect(parsed.deletionRequestedAt).toBeNull();
  });

  it('parses record with serialized timestamp objects across bridge', () => {
    const parsed = parseRenterProfileDocument('renter-1', {
      ...VALID_PROFILE,
      createdAt: { _seconds: 1788256800, _nanoseconds: 0 },
      updatedAt: { seconds: 1789466400, nanoseconds: 0 },
    });

    expect(parsed.createdAt).toBe('2026-09-01T10:00:00.000Z');
    expect(parsed.updatedAt).toBe('2026-09-15T10:00:00.000Z');
  });

  it('parses address containing extraneous metadata by safely normalizing', () => {
    const parsed = parseRenterProfileDocument('renter-1', {
      ...VALID_PROFILE,
      defaultDeliveryAddress: {
        streetAddress: '15 Queens Drive, Ikoyi',
        areaLabel: 'Ikoyi',
        city: 'Lagos',
        country: 'NG',
      },
    });

    expect(parsed.defaultDeliveryAddress).toEqual({
      streetAddress: '15 Queens Drive, Ikoyi',
      areaLabel: 'Ikoyi',
    });
  });

  it.each([
    ['missing renter id', { renterId: undefined }],
    ['missing full name', { fullName: undefined }],
    ['empty full name', { fullName: ' ' }],
    ['invalid phone', { phone: '08012345678' }],
    ['missing account status', { accountStatus: undefined }],
    ['missing renter terms', { acceptedRenterTermsVersion: undefined }],
    ['missing privacy terms', { acceptedPrivacyNoticeVersion: undefined }],
    ['missing profile version', { profileVersion: undefined }],
    ['zero profile version', { profileVersion: 0 }],
    ['missing created timestamp', { createdAt: undefined }],
    ['missing updated timestamp', { updatedAt: undefined }],
  ])('fails closed with profile_invalid_record for %s', (_label, override) => {
    expect(() =>
      parseRenterProfileDocument('renter-1', {
        ...VALID_PROFILE,
        ...override,
      }),
    ).toThrow(RenterProfileError);

    try {
      parseRenterProfileDocument('renter-1', {
        ...VALID_PROFILE,
        ...override,
      });
    } catch (err) {
      expect(err).toBeInstanceOf(RenterProfileError);
      expect((err as RenterProfileError).diagnosticCode).toBe('profile_invalid_record');
    }
  });

  it('rejects a profile whose stored renter ID does not match the document path with profile_identity_mismatch', () => {
    try {
      parseRenterProfileDocument('renter-1', {
        ...VALID_PROFILE,
        renterId: 'renter-2',
      });
      expect.fail('Expected parseRenterProfileDocument to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(RenterProfileError);
      expect((err as RenterProfileError).diagnosticCode).toBe('profile_identity_mismatch');
    }
  });

  it('successfully parses synthetic representations of real Firestore schema variations', () => {
    const synthDoc1 = {
      acceptedPrivacyNoticeVersion: '2026-03-01',
      deletionRequestedAt: null,
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      createdAt: '2026-09-10T07:45:26.588Z',
      profileVersion: 1,
      accountStatus: 'active',
      acceptedRenterTermsVersion: '2026-03-01',
      renterId: 'renter-synth-1',
      updatedAt: '2026-09-10T07:45:26.588Z',
      defaultDeliveryAddress: {
        areaLabel: 'Victoria Island',
        streetAddress: '10 Marina Road',
      },
      deletionReason: null,
      phone: '+2348011111111',
    };

    const synthDoc2 = {
      renterId: 'renter-synth-2',
      acceptedPrivacyNoticeVersion: '2026-03-01',
      createdAt: '2026-09-09T00:12:01.580Z',
      profileVersion: 1,
      accountStatus: 'active',
      defaultDeliveryAddress: {
        areaLabel: 'Victoria Island',
        streetAddress: '14 Marina Road',
        landmark: 'Near Civic Centre',
      },
      acceptedRenterTermsVersion: '2026-03-01',
      updatedAt: '2026-09-09T00:12:01.580Z',
      email: 'chidi@example.com',
      phone: '+2348022222222',
      fullName: 'Chidi Mokeme',
    };

    const synthDoc3 = {
      accountStatus: 'active',
      acceptedRenterTermsVersion: '2026-03-01',
      profileVersion: 1,
      renterId: 'renter-synth-3',
      acceptedPrivacyNoticeVersion: '2026-03-01',
      email: 'zainab@example.com',
      updatedAt: '2026-09-15T02:18:45.415Z',
      defaultDeliveryAddress: {
        areaLabel: 'Ikeja',
        streetAddress: '1 Commercial Avenue, Ikeja, Lagos',
      },
      createdAt: '2026-09-15T02:18:45.415Z',
      deletionReason: null,
      deletionRequestedAt: null,
      fullName: 'Zainab Balogun',
      phone: '+2348033333333',
    };

    expect(() =>
      parseRenterProfileDocument('renter-synth-1', synthDoc1),
    ).not.toThrow();
    expect(() =>
      parseRenterProfileDocument('renter-synth-2', synthDoc2),
    ).not.toThrow();
    expect(() =>
      parseRenterProfileDocument('renter-synth-3', synthDoc3),
    ).not.toThrow();
  });
});
