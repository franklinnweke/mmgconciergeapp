import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { VehicleModerationInspector } from './vehicle-moderation-inspector';
import type { VehicleModerationDetail } from '../domain/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
  }),
}));

function makeVehicle(overrides: Partial<VehicleModerationDetail> = {}): VehicleModerationDetail {
  return {
    vehicleId: 'veh-test-123',
    ownerId: 'owner-test-456',
    ownerLegalName: 'Test Owner',
    make: 'Toyota',
    model: 'Prado',
    year: 2022,
    category: 'executive_suv',
    seats: 7,
    dailyRateKobo: 35000000,
    areaLabel: 'Ikoyi, Lagos',
    plateMasked: 'LND-***-AA',
    imageCount: 1,
    moderationStatus: 'pending_review',
    visibility: 'paused',
    discoverable: false,
    version: 1,
    createdAt: '2026-09-01T12:00:00Z',
    submittedAt: '2026-09-02T12:00:00Z',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    description: 'Luxury SUV in pristine condition.',
    transmission: 'Automatic',
    colour: 'Black',
    images: [
      {
        uploadId: 'up-1',
        originalFileName: 'front.jpg',
        previewUrl: 'https://example.com/front.jpg',
        isPrimary: true,
        byteSize: 1024000,
        contentType: 'image/jpeg',
      },
    ],
    lastDecisionReason: null,
    reviewedByStaffEmail: null,
    reviewedAt: null,
    ...overrides,
  };
}

describe('VehicleModerationInspector state-gated actions and banners', () => {
  it('renders approve and reject actions for pending_review', () => {
    const vehicle = makeVehicle({ moderationStatus: 'pending_review' });
    const html = renderToStaticMarkup(<VehicleModerationInspector vehicle={vehicle} />);

    expect(html).toContain('Approve Listing');
    expect(html).toContain('Request Changes / Reject Listing');
    expect(html).not.toContain('Suspend Listing');
    expect(html).not.toContain('Suspend Active Listing');
    expect(html).not.toContain('Restore to Approved Fleet');
    expect(html).not.toContain('Listing Approved');
    expect(html).not.toContain('Listing Suspended');
    expect(html).not.toContain('Listing Changes Requested / Rejected');
    expect(html).not.toContain('Draft Listing');
  });

  it('renders approved status and Suspend Listing for approved + paused vehicle', () => {
    const vehicle = makeVehicle({
      moderationStatus: 'approved',
      visibility: 'paused',
      discoverable: false,
      reviewedAt: '2026-09-28T20:09:06.154Z',
      reviewedByStaffEmail: 'admin@mmg.ng',
    });
    const html = renderToStaticMarkup(<VehicleModerationInspector vehicle={vehicle} />);

    expect(html).toContain('Listing Approved');
    expect(html).toContain('Approved by MMG, but unavailable to renters until owner activation.');
    expect(html).toContain('Not discoverable to renters.');
    expect(html).toContain('Paused by Owner');
    expect(html).toContain('Suspend Listing');
    expect(html).not.toContain('Suspend Active Listing');
    expect(html).not.toContain('Approve Listing');
    expect(html).not.toContain('Request Changes / Reject Listing');
    expect(html).not.toContain('Restore to Approved Fleet');
  });

  it('renders approved status and Suspend Active Listing for approved + active vehicle', () => {
    const vehicle = makeVehicle({
      moderationStatus: 'approved',
      visibility: 'active',
      discoverable: true,
      reviewedAt: '2026-09-28T20:09:06.154Z',
      reviewedByStaffEmail: 'admin@mmg.ng',
    });
    const html = renderToStaticMarkup(<VehicleModerationInspector vehicle={vehicle} />);

    expect(html).toContain('Listing Approved');
    expect(html).toContain('Approved and active on the platform.');
    expect(html).toContain('Discoverable in renter search.');
    expect(html).toContain('>Active<');
    expect(html).toContain('Suspend Active Listing');
    expect(html).not.toContain('Approve Listing');
    expect(html).not.toContain('Request Changes / Reject Listing');
    expect(html).not.toContain('Restore to Approved Fleet');
  });

  it('renders suspended banner with reason and restore button for suspended vehicle', () => {
    const vehicle = makeVehicle({
      moderationStatus: 'suspended',
      lastDecisionReason: 'Owner failed dispatch SLA',
    });
    const html = renderToStaticMarkup(<VehicleModerationInspector vehicle={vehicle} />);

    expect(html).toContain('Listing Suspended');
    expect(html).toContain('Reason: Owner failed dispatch SLA');
    expect(html).toContain('Restore to Approved Fleet');
    expect(html).not.toContain('Approve Listing');
    expect(html).not.toContain('Request Changes / Reject Listing');
    expect(html).not.toContain('Suspend Listing');
    expect(html).not.toContain('Suspend Active Listing');
  });

  it('renders rejected banner with reason for rejected vehicle', () => {
    const vehicle = makeVehicle({
      moderationStatus: 'rejected',
      lastDecisionReason: 'Plate documents unreadable',
    });
    const html = renderToStaticMarkup(<VehicleModerationInspector vehicle={vehicle} />);

    expect(html).toContain('Listing Changes Requested / Rejected');
    expect(html).toContain('Reason: Plate documents unreadable');
    expect(html).toContain('Awaiting updated submission from vehicle owner.');
    expect(html).not.toContain('Approve Listing');
    expect(html).not.toContain('Request Changes / Reject Listing');
    expect(html).not.toContain('Suspend Listing');
    expect(html).not.toContain('Suspend Active Listing');
    expect(html).not.toContain('Restore to Approved Fleet');
  });

  it('renders draft banner for draft vehicle', () => {
    const vehicle = makeVehicle({ moderationStatus: 'draft' });
    const html = renderToStaticMarkup(<VehicleModerationInspector vehicle={vehicle} />);

    expect(html).toContain('Draft Listing');
    expect(html).toContain('This vehicle listing is still a draft and has not been submitted for review.');
    expect(html).not.toContain('Approve Listing');
    expect(html).not.toContain('Request Changes / Reject Listing');
    expect(html).not.toContain('Suspend Listing');
    expect(html).not.toContain('Suspend Active Listing');
    expect(html).not.toContain('Restore to Approved Fleet');
  });
});
