import {
  CURRENT_COMMISSION_TERMS_VERSION,
  CURRENT_OWNER_TERMS_VERSION,
  CURRENT_PRIVACY_NOTICE_VERSION,
} from '@mmg/contracts';
import { describe, expect, it } from 'vitest';

import { createOwnerIdentityFormSeed } from './owner-identity-form-seed';

describe('owner identity form hydration', () => {
  const baseProfile = {
    ownerId: 'owner-1',
    legalName: 'Franklin Nweke Services',
    address: {
      areaLabel: 'Lekki Phase 1' as const,
      line1: '14 Admiralty Way',
      line2: 'Suite 2',
      city: 'Lagos' as const,
      country: 'NG' as const,
    },
    ownerTermsVersion: CURRENT_OWNER_TERMS_VERSION,
    commissionTermsVersion: CURRENT_COMMISSION_TERMS_VERSION,
    privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
    termsAcceptedAt: '2026-09-01T10:00:00.000Z',
  };

  it('restores saved identity and current agreement acceptance', () => {
    expect(createOwnerIdentityFormSeed(baseProfile)).toEqual({
      ownerId: 'owner-1',
      legalName: 'Franklin Nweke Services',
      areaLabel: 'Lekki Phase 1',
      line1: '14 Admiralty Way',
      line2: 'Suite 2',
      termsAccepted: true,
      commissionAccepted: true,
      privacyAccepted: true,
    });
  });

  it('requires only stale agreements to be accepted again', () => {
    const seed = createOwnerIdentityFormSeed({
      ...baseProfile,
      commissionTermsVersion: 'owner-commission-older',
    });

    expect(seed.termsAccepted).toBe(true);
    expect(seed.commissionAccepted).toBe(false);
    expect(seed.privacyAccepted).toBe(true);
  });

  it('does not mark agreements accepted without an acceptance timestamp', () => {
    const seed = createOwnerIdentityFormSeed({
      ...baseProfile,
      termsAcceptedAt: '',
    });

    expect(seed.termsAccepted).toBe(false);
    expect(seed.commissionAccepted).toBe(false);
    expect(seed.privacyAccepted).toBe(false);
  });
});
