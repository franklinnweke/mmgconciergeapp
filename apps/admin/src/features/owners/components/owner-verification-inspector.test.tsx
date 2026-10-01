import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CURRENT_COMMISSION_TERMS_VERSION, CURRENT_OWNER_TERMS_VERSION, CURRENT_PRIVACY_NOTICE_VERSION } from '@mmg/contracts';
import { OwnerVerificationInspector } from './owner-verification-inspector';
import type { OwnerVerificationDetail } from '../domain/types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('../data/review-owner-verification-action', () => ({ executeReviewDecisionAction: vi.fn() }));

function makeOwner(overrides: Partial<OwnerVerificationDetail> = {}): OwnerVerificationDetail {
  return {
    ownerId: 'owner-test-123', legalName: 'Folashade Test', emailMasked: 'fo***@example.com', phoneMasked: '+234 80***12',
    address: { line1: '12 Victoria Island', areaLabel: 'Victoria Island', city: 'Lagos', country: 'NG' },
    status: 'under_review', submittedAt: '2026-09-20T10:00:00.000Z', reviewedAt: null, reviewerUid: null,
    lastDecision: null, lastDecisionReason: null, previousDecisionReason: null, reviewChecklist: null,
    termsAcceptedAt: '2026-09-20T10:00:00.000Z', ownerTermsVersion: CURRENT_OWNER_TERMS_VERSION,
    commissionTermsVersion: CURRENT_COMMISSION_TERMS_VERSION, privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
    governmentId: { uploadId: 'upload-private-id', documentKind: 'national_id', originalFileName: 'identity.pdf', contentType: 'application/pdf', byteSize: 1024, uploadedAt: '2026-09-19T10:00:00.000Z', bytesState: 'present', documentPreviewUrl: 'https://example.com/id.pdf' },
    documentPreviewUrl: 'https://example.com/id.pdf', version: 4, createdAt: '2026-09-10T10:00:00.000Z', updatedAt: '2026-09-20T10:00:00.000Z',
    auditLogs: [], auditTrailUnavailable: false,
    ...overrides,
  };
}

describe('Owner verification review', () => {
  it('keeps masked identity, address and ID evidence visible while approval stays disabled until all five checks', () => {
    const html = renderToStaticMarkup(<OwnerVerificationInspector detail={makeOwner()} />);
    expect(html).toContain('Folashade Test');
    expect(html).toContain('fo***@example.com');
    expect(html).toContain('+234 80***12');
    expect(html).toContain('12 Victoria Island');
    expect(html).toContain('Government ID');
    expect(html).toContain('PDF document');
    expect(html.match(/type="checkbox"/g)).toHaveLength(5);
    const approveButton = html.match(/<button[^>]*>[\s\S]*?Approve owner<\/button>/)?.[0];
    expect(approveButton).toContain('disabled=""');
    expect(html).not.toMatch(/<input[^>]*type="checkbox"[^>]*checked/);
    expect(html).toContain('<summary>More actions</summary>');
    expect(html).not.toMatch(/<details[^>]*open/);
  });

  it('keeps exceptional states informational and actions gated by the current status', () => {
    const submitted = renderToStaticMarkup(<OwnerVerificationInspector detail={makeOwner({ status: 'submitted' })} />);
    expect(submitted).toContain('Start review');
    expect(submitted).not.toContain('lock the record');
    expect(submitted).not.toContain('Approve owner');

    const approved = renderToStaticMarkup(<OwnerVerificationInspector detail={makeOwner({ status: 'approved' })} />);
    expect(approved).toContain('Owner approval is active.');
    expect(approved).toContain('Suspend owner');
    expect(approved).not.toContain('Approve owner');
    expect(approved).not.toMatch(/<details[^>]*open/);

    const suspended = renderToStaticMarkup(<OwnerVerificationInspector detail={makeOwner({ status: 'suspended' })} />);
    expect(suspended).toContain('Restore owner');
    expect(suspended).toContain('Revoke owner');
    expect(suspended).not.toContain('Approve owner');

    const revoked = renderToStaticMarkup(<OwnerVerificationInspector detail={makeOwner({ status: 'revoked' })} />);
    expect(revoked).toContain('Owner approval has been revoked.');
    expect(revoked).not.toContain('Revoke owner');
    expect(revoked).not.toContain('Restore owner');
  });

  it('shows retention and stale accepted-terms evidence without presuming either is a new approval check', () => {
    const retained = renderToStaticMarkup(<OwnerVerificationInspector detail={makeOwner({ governmentId: { uploadId: 'upload-private-id', documentKind: 'national_id', originalFileName: 'identity.pdf', contentType: 'application/pdf', byteSize: 1024, uploadedAt: '2026-09-19T10:00:00.000Z', bytesState: 'cleared', documentPreviewUrl: null }, documentPreviewUrl: null, ownerTermsVersion: 'old-owner-terms', auditTrailUnavailable: true })} />);
    expect(retained).toContain('Document removed under retention policy');
    expect(retained).not.toContain('Re-upload is required');
    expect(retained).toContain('review accepted versions');
    expect(retained).toContain('old-owner-terms');
    expect(retained).not.toMatch(/<details[^>]*open/);
    expect(retained.match(/type="checkbox"/g)).toHaveLength(5);
    expect(retained).toContain('Audit history could not be loaded');
  });
});
