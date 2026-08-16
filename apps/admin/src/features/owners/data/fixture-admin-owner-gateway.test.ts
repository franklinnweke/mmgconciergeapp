import { describe, expect, it } from 'vitest';

import { FixtureAdminOwnerGateway } from './fixture-admin-owner-gateway';

describe('FixtureAdminOwnerGateway', () => {
  const gateway = new FixtureAdminOwnerGateway();

  it('lists all fixture owner verification records', async () => {
    const page = await gateway.listOwnerVerifications();
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.some((item) => item.status === 'submitted')).toBe(true);
    expect(page.items.some((item) => item.status === 'approved')).toBe(true);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it('filters owner verifications by status', async () => {
    const submitted = await gateway.listOwnerVerifications({ status: 'submitted' });
    expect(submitted.items.every((item) => item.status === 'submitted')).toBe(true);

    const underReview = await gateway.listOwnerVerifications({ status: 'under_review' });
    expect(underReview.items.every((item) => item.status === 'under_review')).toBe(true);
  });

  it('pages forward through the queue with a cursor and never repeats a row', async () => {
    const all = await gateway.listOwnerVerifications();
    expect(all.items.length).toBeGreaterThan(1);

    const first = await gateway.listOwnerVerifications({ pageSize: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBe(first.items[0]?.ownerId);

    const second = await gateway.listOwnerVerifications({
      pageSize: 1,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.items).toHaveLength(1);
    expect(second.items[0]?.ownerId).not.toBe(first.items[0]?.ownerId);
    expect(second.items[0]?.ownerId).toBe(all.items[1]?.ownerId);
  });

  it('reports no further pages once the last row is reached', async () => {
    const all = await gateway.listOwnerVerifications();
    const last = await gateway.listOwnerVerifications({
      pageSize: all.items.length,
    });
    expect(last.items).toHaveLength(all.items.length);
    expect(last.hasMore).toBe(false);
    expect(last.nextCursor).toBeNull();
  });

  it('treats an unknown cursor as the start of the queue rather than throwing', async () => {
    // A reviewed record can disappear from a filtered view between page loads.
    // Losing the cursor must degrade to a valid page, not a 500.
    const page = await gateway.listOwnerVerifications({ cursor: 'owner-that-no-longer-matches' });
    expect(page.items.length).toBeGreaterThan(0);
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
