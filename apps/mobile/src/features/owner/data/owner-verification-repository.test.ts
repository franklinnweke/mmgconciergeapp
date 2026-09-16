import { describe, expect, it, vi, type Mock } from 'vitest';

import { onSnapshot } from '@react-native-firebase/firestore';

import type { OwnerVisibleProfile } from '@mmg/contracts';

import { createOwnerVerificationRepository } from './owner-verification-repository';

vi.mock('@react-native-firebase/firestore', () => ({
  doc: vi.fn(() => 'doc-ref'),
  getFirestore: vi.fn(() => 'db'),
  onSnapshot: vi.fn((_ref: unknown, _onData: unknown) => () => {}),
}));

/**
 * React Native Firebase snapshots expose `exists` as a METHOD on the snapshot
 * class prototype, not a boolean property. The fakes here mirror that shape so
 * a regression back to `!docSnap.exists` (always false, since the method
 * reference is truthy) fails these tests instead of shipping.
 */
function nativeSnapshot(options: { exists: boolean; data?: Record<string, unknown> }) {
  return {
    id: 'owner-1',
    exists: () => options.exists,
    data: () => options.data,
  };
}

const VALID_PROFILE_DOCUMENT = {
  ownerId: 'owner-1',
  legalName: 'Chidi Musa',
  displayName: 'Chidi Musa',
  address: {
    areaLabel: 'Lekki',
    line1: '12 Admiralty Way, Lekki Phase 1',
    city: 'Lagos',
    country: 'NG',
  },
  verificationStatus: 'draft',
  verificationUpdatedAt: '2026-08-16T09:00:00.000Z',
  lastDecisionReason: null,
  ownerTermsVersion: 'owner-terms-2026-08-01',
  commissionTermsVersion: 'owner-commission-2026-08-01',
  privacyNoticeVersion: 'privacy-notice-2026-08-01',
  termsAcceptedAt: '2026-08-16T09:00:00.000Z',
  governmentId: null,
  createdAt: '2026-08-16T09:00:00.000Z',
  updatedAt: '2026-08-16T09:00:00.000Z',
  version: 1,
};

function subscribeAndEmit(snapshot: unknown): {
  updates: (OwnerVisibleProfile | null)[];
  errors: Error[];
} {
  const repository = createOwnerVerificationRepository();
  const updates: (OwnerVisibleProfile | null)[] = [];
  const errors: Error[] = [];
  repository.subscribe(
    'owner-1',
    (profile) => updates.push(profile),
    (error) => errors.push(error),
  );

  const onData = (onSnapshot as unknown as Mock).mock.calls.at(-1)![1] as (
    snapshot: unknown,
  ) => void;
  onData(snapshot);
  return { updates, errors };
}

describe('createOwnerVerificationRepository', () => {
  it('reports a missing profile document as an incomplete draft, not an error', () => {
    const { updates, errors } = subscribeAndEmit(
      nativeSnapshot({ exists: false, data: undefined }),
    );

    expect(updates).toEqual([null]);
    expect(errors).toEqual([]);
  });

  it('parses an existing profile document and emits it', () => {
    const { updates, errors } = subscribeAndEmit(
      nativeSnapshot({ exists: true, data: VALID_PROFILE_DOCUMENT }),
    );

    expect(errors).toEqual([]);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      ownerId: 'owner-1',
      legalName: 'Chidi Musa',
      verificationStatus: 'draft',
      version: 1,
    });
  });

  it.each([
    ['missing owner id', { ownerId: undefined }],
    ['wrong owner id', { ownerId: 'other-owner' }],
    ['missing legal name', { legalName: undefined }],
    ['missing version', { version: undefined }],
    ['zero version', { version: 0 }],
    ['string version', { version: '1' }],
  ])('fails closed for %s instead of inventing trusted profile state', (_label, override) => {
    const { updates, errors } = subscribeAndEmit(
      nativeSnapshot({
        exists: true,
        data: { ...VALID_PROFILE_DOCUMENT, ...override },
      }),
    );

    expect(updates).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
  });

  it('reports a corrupted profile document through onError', () => {
    const { updates, errors } = subscribeAndEmit(
      nativeSnapshot({ exists: true, data: { legalName: 42 } }),
    );

    expect(updates).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
  });
});
