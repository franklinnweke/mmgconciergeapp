import { describe, expect, it, vi } from 'vitest';

import { WebRenterProfileGateway } from './renter-profile-gateway.web';

const mockProfileData = {
  renterId: 'renter-1',
  fullName: 'Babatunde Adeleke',
  email: 'renter@example.com',
  phone: '+2348012345678',
  defaultDeliveryAddress: {
    streetAddress: '15 Queens Drive, Ikoyi',
    areaLabel: 'Ikoyi',
  },
  acceptedRenterTermsVersion: '2026-03-01',
  acceptedPrivacyNoticeVersion: '2026-03-01',
  accountStatus: 'active',
  profileVersion: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockHttpsCallable = vi.fn();

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(async () => ({
    exists: () => true,
    data: () => mockProfileData,
  })),
}));

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(() => mockHttpsCallable),
}));

describe('WebRenterProfileGateway', () => {
  const gateway = new WebRenterProfileGateway();

  it('fetches renter profile from firestore', async () => {
    const profile = await gateway.getRenterProfile('renter-1');
    expect(profile).not.toBeNull();
    expect(profile!.fullName).toBe('Babatunde Adeleke');
    expect(profile!.accountStatus).toBe('active');
  });

  it('completes renter profile via cloud function', async () => {
    mockHttpsCallable.mockResolvedValueOnce({
      data: {
        requestId: 'req-1',
        result: {
          renterId: 'renter-1',
          fullName: 'Babatunde Adeleke',
          email: 'renter@example.com',
          phone: '+2348012345678',
          defaultDeliveryAddress: {
            streetAddress: '15 Queens Drive, Ikoyi',
            areaLabel: 'Ikoyi',
          },
          accountStatus: 'active',
          profileVersion: 1,
          updatedAt: new Date().toISOString(),
        },
      },
    });

    const result = await gateway.completeProfile({
      fullName: 'Babatunde Adeleke',
      phone: '+2348012345678',
      defaultDeliveryAddress: {
        streetAddress: '15 Queens Drive, Ikoyi',
        areaLabel: 'Ikoyi',
      },
      acceptedRenterTermsVersion: '2026-03-01',
      acceptedPrivacyNoticeVersion: '2026-03-01',
    });

    expect(result.result.renterId).toBe('renter-1');
    expect(result.result.accountStatus).toBe('active');
  });

  it('submits deletion request via cloud function', async () => {
    mockHttpsCallable.mockResolvedValueOnce({
      data: {
        requestId: 'req-del-1',
        result: {
          renterId: 'renter-1',
          accountStatus: 'deletion_requested',
          requestedAt: new Date().toISOString(),
        },
      },
    });

    const result = await gateway.requestDeletion({
      confirmation: true,
      reason: 'Relocating from Nigeria',
    });

    expect(result.result.accountStatus).toBe('deletion_requested');
  });
});
