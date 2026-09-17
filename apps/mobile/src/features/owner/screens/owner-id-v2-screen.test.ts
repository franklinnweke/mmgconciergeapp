import { describe, expect, it } from 'vitest';
import {
  CURRENT_COMMISSION_TERMS_VERSION,
  CURRENT_OWNER_TERMS_VERSION,
  CURRENT_PRIVACY_NOTICE_VERSION,
  type OwnerVisibleProfile,
} from '@mmg/contracts';

import { computeOwnerIdScreenState } from '../domain/owner-application';

describe('OwnerIdV2Screen state calculation', () => {
  const baseProfile: OwnerVisibleProfile = {
    ownerId: 'owner-1',
    legalName: 'Alhaji Musa Danjuma',
    displayName: 'Alhaji Musa Danjuma',
    address: {
      line1: '14 Admiralty Way',
      areaLabel: 'Lekki Phase 1',
      city: 'Lagos',
      country: 'NG',
    },
    verificationStatus: 'draft',
    verificationUpdatedAt: '2026-09-16T12:00:00.000Z',
    lastDecisionReason: null,
    ownerTermsVersion: CURRENT_OWNER_TERMS_VERSION,
    commissionTermsVersion: CURRENT_COMMISSION_TERMS_VERSION,
    privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
    termsAcceptedAt: '2026-09-16T12:00:00.000Z',
    governmentId: {
      uploadId: 'upload-existing-01',
      documentKind: 'national_id',
      contentType: 'image/jpeg',
      byteSize: 1024,
      uploadedAt: '2026-09-16T12:00:00.000Z',
      status: 'uploaded',
    },
    createdAt: '2026-09-16T12:00:00.000Z',
    updatedAt: '2026-09-16T12:00:00.000Z',
    version: 1,
  };

  it('allows continuing to review with an existing document for draft applications', () => {
    const state = computeOwnerIdScreenState({
      profile: baseProfile,
      phoneNumber: '+2348012345678',
      emailVerified: true,
      hasSelectedAsset: false,
    });

    expect(state.prerequisitesMet).toBe(true);
    expect(state.editable).toBe(true);
    expect(state.hasExistingDocument).toBe(true);
    expect(state.canContinueToReview).toBe(true);
  });

  it('regression: rejected application during deletion-pending window never treats previous ID as reusable', () => {
    // Rejection schedules deletion of the previous upload while profile retains document metadata
    const rejectedProfile: OwnerVisibleProfile = {
      ...baseProfile,
      verificationStatus: 'rejected',
      lastDecisionReason: 'Identity document expired.',
      governmentId: {
        uploadId: 'upload-rejected-pending-deletion',
        documentKind: 'national_id',
        contentType: 'image/jpeg',
        byteSize: 1024,
        uploadedAt: '2026-09-16T12:00:00.000Z',
        status: 'submitted',
      },
    };

    // Without selecting a replacement photo, Continue to review MUST be disabled
    const withoutReplacement = computeOwnerIdScreenState({
      profile: rejectedProfile,
      phoneNumber: '+2348012345678',
      emailVerified: true,
      hasSelectedAsset: false,
    });

    expect(withoutReplacement.editable).toBe(true);
    expect(withoutReplacement.prerequisitesMet).toBe(true);
    expect(withoutReplacement.hasExistingDocument).toBe(false);
    expect(withoutReplacement.canContinueToReview).toBe(false);

    // Only after user selects a fresh replacement photo does Continue to review become enabled
    const withReplacement = computeOwnerIdScreenState({
      profile: rejectedProfile,
      phoneNumber: '+2348012345678',
      emailVerified: true,
      hasSelectedAsset: true,
    });

    expect(withReplacement.hasExistingDocument).toBe(false);
    expect(withReplacement.canContinueToReview).toBe(true);
  });

  it('disables continue when prerequisites (agreements/phone/email) are incomplete even if photo is selected', () => {
    const staleTermsProfile: OwnerVisibleProfile = {
      ...baseProfile,
      ownerTermsVersion: 'owner-terms-outdated',
    };

    const state = computeOwnerIdScreenState({
      profile: staleTermsProfile,
      phoneNumber: '+2348012345678',
      emailVerified: true,
      hasSelectedAsset: true,
    });

    expect(state.agreementsCurrent).toBe(false);
    expect(state.identityComplete).toBe(false);
    expect(state.prerequisitesMet).toBe(false);
    expect(state.canContinueToReview).toBe(false);
  });
});
