import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { extractSafeErrorMessage, getVehicleActionWarning, VehicleModerationInspector } from './vehicle-moderation-inspector';
import type { VehicleModerationDetail } from '../domain/types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

function makeVehicle(overrides: Partial<VehicleModerationDetail> = {}): VehicleModerationDetail {
  return {
    vehicleId: 'veh-test-123', ownerId: 'owner-test-456', ownerLegalName: 'Test Owner',
    make: 'Toyota', model: 'Prado', year: 2022, category: 'executive_suv', seats: 7,
    dailyRateKobo: 35000000, areaLabel: 'Ikoyi, Lagos', plateMasked: 'LND-***-AA',
    imageCount: 1, moderationStatus: 'pending_review', visibility: 'paused', discoverable: false,
    version: 1, createdAt: '2026-09-01T12:00:00Z', submittedAt: '2026-09-02T12:00:00Z',
    thumbnailUrl: 'https://example.com/thumb.jpg', description: 'Luxury SUV in good condition.',
    transmission: 'Automatic', colour: 'Black', images: [{ uploadId: 'up-1', originalFileName: 'front.jpg', previewUrl: 'https://example.com/front.jpg', isPrimary: true, byteSize: 1024000, contentType: 'image/jpeg' }],
    lastDecisionReason: null, reviewedByStaffEmail: null, reviewedAt: null,
    ...overrides,
  };
}

describe('Vehicle moderation review', () => {
  it('shows the evidence and seven unchecked requirements, with approval disabled and secondary action disclosed', () => {
    const html = renderToStaticMarkup(<VehicleModerationInspector vehicle={makeVehicle()} />);
    expect(html).toContain('Toyota Prado');
    expect(html).toContain('Test Owner');
    expect(html).toContain('LND-***-AA');
    expect(html.match(/type="checkbox"/g)).toHaveLength(7);
    expect(html).toContain('Required inspection');
    expect(html).toContain('Approve listing');
    const approveButton = html.match(/<button[^>]*>[\s\S]*?Approve listing<\/button>/)?.[0];
    expect(approveButton).toContain('disabled=""');
    expect(html).toContain('<summary>More actions</summary>');
    expect(html).not.toMatch(/<details[^>]*open/);
    const rejectButton = html.match(/<button[^>]*>[\s\S]*?Confirm changes requested \/ rejection<\/button>/)?.[0];
    expect(rejectButton).toContain('disabled=""');
    expect(html).toContain('At least 10 characters');
    expect(html).not.toContain('Suspend');
    expect(html).not.toContain('Restore to approved fleet');
  });

  it('shows approval state and hides suspension behind More actions', () => {
    const html = renderToStaticMarkup(<VehicleModerationInspector vehicle={makeVehicle({ moderationStatus: 'approved', visibility: 'paused' })} />);
    expect(html).toContain('Approved');
    expect(html).toContain('owner has paused availability');
    expect(html).toContain('Confirm suspension');
    expect(html).not.toContain('Approve listing');
    expect(html).not.toContain('Restore to approved fleet');
  });

  it('does not offer suspension or call a deleted vehicle owner-paused', () => {
    const html = renderToStaticMarkup(<VehicleModerationInspector vehicle={makeVehicle({ moderationStatus: 'approved', visibility: 'deleted' })} />);
    expect(html).toContain('Deleted');
    expect(html).not.toContain('owner has paused availability');
    expect(html).not.toContain('<summary>More actions</summary>');
    expect(html).not.toContain('Suspend listing');
  });

  it('provides restore only for suspended vehicles and keeps terminal/draft states informational', () => {
    const suspended = renderToStaticMarkup(<VehicleModerationInspector vehicle={makeVehicle({ moderationStatus: 'suspended', lastDecisionReason: 'Dispatch issues confirmed' })} />);
    expect(suspended).toContain('Restore to approved fleet');
    expect(suspended).toContain('Dispatch issues confirmed');
    expect(suspended).not.toContain('Approve listing');

    const rejected = renderToStaticMarkup(<VehicleModerationInspector vehicle={makeVehicle({ moderationStatus: 'rejected', lastDecisionReason: 'Plate documents unreadable' })} />);
    expect(rejected).toContain('Changes requested');
    expect(rejected).toContain('Plate documents unreadable');
    expect(rejected).not.toContain('Approve listing');

    const draft = renderToStaticMarkup(<VehicleModerationInspector vehicle={makeVehicle({ moderationStatus: 'draft' })} />);
    expect(draft).toContain('not been submitted for review');
    expect(draft).not.toContain('Approve listing');
  });
});

describe('Vehicle moderation response safety', () => {
  it('preserves publication warnings without claiming that an unpromoted listing went live', () => {
    expect(getVehicleActionWarning({ warning: 'Listing approved, but photo publication needs attention.' })).toBe('Listing approved, but photo publication needs attention.');
    expect(getVehicleActionWarning({ warning: { internal: 'do not expose' } })).toBeNull();
    expect(getVehicleActionWarning({})).toBeNull();
  });

  it('uses safe errors and identifies stale vehicle responses for refresh', async () => {
    const stale = await extractSafeErrorMessage(new Response(JSON.stringify({ error: 'This vehicle changed while you were reviewing it.' }), { status: 409 }));
    expect(stale.isStaleVersion).toBe(true);
    const unsafe = await extractSafeErrorMessage(new Response(JSON.stringify({ error: 'x'.repeat(300) }), { status: 500 }));
    expect(unsafe.message).toBe('The review service is temporarily unavailable. Try again.');
    expect(unsafe.isStaleVersion).toBe(false);
  });
});
