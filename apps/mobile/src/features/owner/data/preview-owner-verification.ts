import {
  CURRENT_COMMISSION_TERMS_VERSION,
  CURRENT_OWNER_TERMS_VERSION,
  CURRENT_PRIVACY_NOTICE_VERSION,
  type OwnerVisibleProfile,
} from '@mmg/contracts';

export const PREVIEW_OWNER_PROFILE: OwnerVisibleProfile = {
  ownerId: 'preview-owner-01',
  legalName: 'Chief Adeleke Olanrewaju',
  displayName: 'Chief Adeleke Olanrewaju',
  address: {
    line1: '12 Admiralty Way',
    areaLabel: 'Lekki Phase 1',
    city: 'Lagos',
    country: 'NG',
  },
  verificationStatus: 'draft',
  verificationUpdatedAt: '2026-08-15T12:00:00.000Z',
  lastDecisionReason: null,
  ownerTermsVersion: CURRENT_OWNER_TERMS_VERSION,
  commissionTermsVersion: CURRENT_COMMISSION_TERMS_VERSION,
  privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
  termsAcceptedAt: '2026-08-15T12:00:00.000Z',
  governmentId: {
    uploadId: 'upload-preview-id-01',
    documentKind: 'national_id',
    contentType: 'image/jpeg',
    byteSize: 1450230,
    uploadedAt: '2026-08-15T12:00:00.000Z',
    status: 'submitted',
  },
  createdAt: '2026-08-15T10:00:00.000Z',
  updatedAt: '2026-08-15T12:00:00.000Z',
  version: 1,
};
