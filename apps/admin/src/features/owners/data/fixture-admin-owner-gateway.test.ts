import { describe, expect, it } from 'vitest';

import { FixtureAdminOwnerGateway } from './fixture-admin-owner-gateway';

describe('FixtureAdminOwnerGateway', () => {
  const gateway = new FixtureAdminOwnerGateway();

  it('lists all fixture owner verification records', async () => {
    const list = await gateway.listOwnerVerifications();
    expect(list.length).toBeGreaterThan(0);
    expect(list.some((item) => item.status === 'submitted')).toBe(true);
    expect(list.some((item) => item.status === 'approved')).toBe(true);
  });

  it('filters owner verifications by status', async () => {
    const submitted = await gateway.listOwnerVerifications({ status: 'submitted' });
    expect(submitted.every((item) => item.status === 'submitted')).toBe(true);

    const underReview = await gateway.listOwnerVerifications({ status: 'under_review' });
    expect(underReview.every((item) => item.status === 'under_review')).toBe(true);
  });

  it('gets owner verification detail for a known owner with masked PII and documentPreviewUrl', async () => {
    const detail = await gateway.getOwnerVerificationDetail('owner-adeleke-01');
    expect(detail).not.toBeNull();
    expect(detail?.legalName).toBe('Chief Adeleke Olanrewaju');
    expect(detail?.emailMasked).toBe('a***o@example.com');
    expect(detail?.phoneMasked).toBe('+234****6789');
    expect(detail?.governmentId?.documentKind).toBe('national_id');
    expect(detail?.governmentId?.bytesState).toBe('present');
    expect(detail?.documentPreviewUrl).toContain('https://');
    expect((detail?.governmentId as Record<string, unknown>)?.storagePath).toBeUndefined();
  });

  it('returns null for an unknown owner ID', async () => {
    const detail = await gateway.getOwnerVerificationDetail('non-existent-owner');
    expect(detail).toBeNull();
  });
});
