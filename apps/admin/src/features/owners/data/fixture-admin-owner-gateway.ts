import { maskEmail, maskPhone } from '@mmg/contracts';

import type {
  OwnerVerificationDetail,
  OwnerVerificationListItem,
} from '../domain/types';
import type {
  AdminOwnerGateway,
  OwnerVerificationPage,
  OwnerVerificationQuery,
} from './admin-owner-gateway';

export const FIXTURE_OWNER_VERIFICATIONS: OwnerVerificationDetail[] = [
  {
    ownerId: 'owner-adeleke-01',
    legalName: 'Chief Adeleke Olanrewaju',
    emailMasked: maskEmail('adeleke.o@example.com'),
    phoneMasked: maskPhone('+2348023456789'),
    address: {
      line1: '12 Admiralty Way',
      areaLabel: 'Lekki Phase 1',
      city: 'Lagos',
      country: 'NG',
    },
    status: 'submitted',
    submittedAt: '2026-08-15T10:30:00.000Z',
    reviewedAt: null,
    reviewerUid: null,
    lastDecision: null,
    lastDecisionReason: null,
    previousDecisionReason: null,
    reviewChecklist: null,
    termsAcceptedAt: '2026-08-15T10:15:00.000Z',
    ownerTermsVersion: '2026-04-01-v1',
    commissionTermsVersion: '2026-04-01-v1',
    privacyNoticeVersion: '2026-04-01-v1',
    governmentId: {
      uploadId: 'upload-adeleke-nin-01',
      documentKind: 'national_id',
      originalFileName: 'national-identity-slip.jpg',
      contentType: 'image/jpeg',
      byteSize: 1450230,
      uploadedAt: '2026-08-15T10:25:00.000Z',
      bytesState: 'present',
      documentPreviewUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=800&auto=format&fit=crop&q=80',
    },
    documentPreviewUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=800&auto=format&fit=crop&q=80',
    version: 2,
    createdAt: '2026-08-15T10:00:00.000Z',
    updatedAt: '2026-08-15T10:30:00.000Z',
    auditLogs: [],
  },
  {
    ownerId: 'owner-folashade-02',
    legalName: 'Folashade Alakija',
    emailMasked: maskEmail('folashade.a@example.com'),
    phoneMasked: maskPhone('+2348034567890'),
    address: {
      line1: '4B Ozumba Mbadiwe Avenue',
      areaLabel: 'Victoria Island',
      city: 'Lagos',
      country: 'NG',
    },
    status: 'under_review',
    submittedAt: '2026-08-15T09:00:00.000Z',
    reviewedAt: '2026-08-15T09:30:00.000Z',
    reviewerUid: 'staff-admin-01',
    lastDecision: 'start_review',
    lastDecisionReason: null,
    previousDecisionReason: null,
    reviewChecklist: null,
    termsAcceptedAt: '2026-08-15T08:50:00.000Z',
    ownerTermsVersion: '2026-04-01-v1',
    commissionTermsVersion: '2026-04-01-v1',
    privacyNoticeVersion: '2026-04-01-v1',
    governmentId: {
      uploadId: 'upload-folashade-dl-01',
      documentKind: 'drivers_licence',
      originalFileName: 'drivers-license-front.png',
      contentType: 'image/png',
      byteSize: 2097152,
      uploadedAt: '2026-08-15T08:55:00.000Z',
      bytesState: 'present',
      documentPreviewUrl: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=800&auto=format&fit=crop&q=80',
    },
    documentPreviewUrl: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=800&auto=format&fit=crop&q=80',
    version: 3,
    createdAt: '2026-08-15T08:45:00.000Z',
    updatedAt: '2026-08-15T09:30:00.000Z',
    auditLogs: [
      {
        logId: 'audit-log-01',
        actorId: 'staff-admin-01',
        role: 'verification_admin',
        action: 'owner.verification_decided',
        reason: null,
        createdAt: '2026-08-15T09:30:00.000Z',
      },
    ],
  },
  {
    ownerId: 'owner-babatunde-03',
    legalName: 'Babatunde Fashola',
    emailMasked: maskEmail('babatunde.f@example.com'),
    phoneMasked: maskPhone('+2348056789012'),
    address: {
      line1: '8 Kingsway Road',
      areaLabel: 'Ikoyi',
      city: 'Lagos',
      country: 'NG',
    },
    status: 'approved',
    submittedAt: '2026-08-14T14:00:00.000Z',
    reviewedAt: '2026-08-14T14:45:00.000Z',
    reviewerUid: 'staff-admin-01',
    lastDecision: 'approve',
    lastDecisionReason: null,
    previousDecisionReason: null,
    reviewChecklist: {
      identity_matches_id: true,
      document_legible: true,
      lagos_address_plausible: true,
      current_terms_accepted: true,
      no_fraud_indicators: true,
    },
    termsAcceptedAt: '2026-08-14T13:40:00.000Z',
    ownerTermsVersion: '2026-04-01-v1',
    commissionTermsVersion: '2026-04-01-v1',
    privacyNoticeVersion: '2026-04-01-v1',
    governmentId: {
      uploadId: 'upload-babatunde-pass-01',
      documentKind: 'international_passport',
      originalFileName: 'nigerian-passport-data-page.jpg',
      contentType: 'image/jpeg',
      byteSize: 1845120,
      uploadedAt: '2026-08-14T13:55:00.000Z',
      bytesState: 'present',
      documentPreviewUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=800&auto=format&fit=crop&q=80',
    },
    documentPreviewUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=800&auto=format&fit=crop&q=80',
    version: 4,
    createdAt: '2026-08-14T13:30:00.000Z',
    updatedAt: '2026-08-14T14:45:00.000Z',
    auditLogs: [
      {
        logId: 'audit-log-02',
        actorId: 'staff-admin-01',
        role: 'verification_admin',
        action: 'owner.verification_decided',
        reason: null,
        createdAt: '2026-08-14T14:45:00.000Z',
      },
    ],
  },
  {
    ownerId: 'owner-emeka-04',
    legalName: 'Emeka Okonkwo',
    emailMasked: maskEmail('emeka.o@example.com'),
    phoneMasked: maskPhone('+2348078901234'),
    address: {
      line1: '22 Isaac John Street',
      areaLabel: 'Ikeja',
      city: 'Lagos',
      country: 'NG',
    },
    status: 'rejected',
    submittedAt: '2026-08-13T11:00:00.000Z',
    reviewedAt: '2026-08-13T11:30:00.000Z',
    reviewerUid: 'staff-admin-01',
    lastDecision: 'reject',
    lastDecisionReason: 'Uploaded passport document was expired. Please provide a valid, active ID.',
    previousDecisionReason: null,
    reviewChecklist: null,
    termsAcceptedAt: '2026-08-13T10:45:00.000Z',
    ownerTermsVersion: '2026-04-01-v1',
    commissionTermsVersion: '2026-04-01-v1',
    privacyNoticeVersion: '2026-04-01-v1',
    governmentId: {
      uploadId: 'upload-emeka-pass-01',
      documentKind: 'international_passport',
      originalFileName: 'expired-passport.jpg',
      contentType: 'image/jpeg',
      byteSize: 980120,
      uploadedAt: '2026-08-13T10:55:00.000Z',
      bytesState: 'present',
      documentPreviewUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=800&auto=format&fit=crop&q=80',
    },
    documentPreviewUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=800&auto=format&fit=crop&q=80',
    version: 3,
    createdAt: '2026-08-13T10:30:00.000Z',
    updatedAt: '2026-08-13T11:30:00.000Z',
    auditLogs: [],
  },
];

export class FixtureAdminOwnerGateway implements AdminOwnerGateway {
  private verifications = [...FIXTURE_OWNER_VERIFICATIONS];

  async listOwnerVerifications(query?: OwnerVerificationQuery): Promise<OwnerVerificationPage> {
    let list = this.verifications;
    if (query?.status) {
      list = list.filter((item) => item.status === query.status);
    }

    const rows: OwnerVerificationListItem[] = list.map((item) => ({
      ownerId: item.ownerId,
      legalName: item.legalName,
      emailMasked: item.emailMasked,
      phoneMasked: item.phoneMasked,
      status: item.status,
      submittedAt: item.submittedAt,
      reviewedAt: item.reviewedAt,
      reviewerUid: item.reviewerUid,
      version: item.version,
      updatedAt: item.updatedAt,
      areaLabel: item.address?.areaLabel,
    }));

    // Mirror the Firestore gateway's forward-only cursor so the queue page
    // exercises the same pagination shape in fixture mode.
    const pageSize = query?.pageSize && query.pageSize > 0 ? query.pageSize : rows.length;
    const startIndex = query?.cursor
      ? rows.findIndex((row) => row.ownerId === query.cursor) + 1
      : 0;
    const offset = startIndex > 0 ? startIndex : 0;
    const items = rows.slice(offset, offset + pageSize);
    const hasMore = offset + items.length < rows.length;

    return {
      items,
      nextCursor: hasMore ? (items[items.length - 1]?.ownerId ?? null) : null,
      hasMore,
    };
  }

  async getOwnerVerificationDetail(ownerId: string): Promise<OwnerVerificationDetail | null> {
    const found = this.verifications.find((item) => item.ownerId === ownerId);
    return found ? { ...found } : null;
  }

  async mintSignedDocumentUrl(storagePath: string): Promise<string | null> {
    return `https://example.com/mock-signed-url?path=${encodeURIComponent(storagePath)}`;
  }
}
