import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PreviewRenterProfileGateway,
  WebRenterProfileGateway,
  createRenterProfileGateway,
} from './renter-profile-gateway.web';
import { RenterProfileError } from './renter-profile-record';

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
const mockGetDoc = vi.fn();

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  doc: vi.fn(),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
}));

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(() => mockHttpsCallable),
}));

describe('WebRenterProfileGateway', () => {
  const gateway = new WebRenterProfileGateway();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => mockProfileData,
    });
  });

  it('fetches renter profile from firestore when document exists', async () => {
    const profile = await gateway.getRenterProfile('renter-1');
    expect(profile).not.toBeNull();
    expect(profile!.fullName).toBe('Babatunde Adeleke');
    expect(profile!.accountStatus).toBe('active');
  });

  it('returns null without throwing when document does not exist', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => false,
      data: () => undefined,
    });

    const profile = await gateway.getRenterProfile('renter-1');
    expect(profile).toBeNull();
  });

  it('classifies permission-denied Firestore errors as profile_permission_denied', async () => {
    const permError = Object.assign(new Error('Missing permission'), {
      code: 'firestore/permission-denied',
    });
    mockGetDoc.mockRejectedValueOnce(permError);

    let capturedErr: unknown = null;
    try {
      await gateway.getRenterProfile('renter-1');
    } catch (err) {
      capturedErr = err;
    }

    expect(capturedErr).toBeInstanceOf(RenterProfileError);
    expect((capturedErr as RenterProfileError).diagnosticCode).toBe('profile_permission_denied');
  });

  it('classifies unavailable/network errors as profile_unavailable', async () => {
    const networkError = Object.assign(new Error('Network offline'), {
      code: 'unavailable',
    });
    mockGetDoc.mockRejectedValueOnce(networkError);

    let capturedErr: unknown = null;
    try {
      await gateway.getRenterProfile('renter-1');
    } catch (err) {
      capturedErr = err;
    }

    expect(capturedErr).toBeInstanceOf(RenterProfileError);
    expect((capturedErr as RenterProfileError).diagnosticCode).toBe('profile_unavailable');
  });

  it('classifies unknown read errors as profile_read_failed rather than profile_unavailable', async () => {
    const unknownError = Object.assign(new Error('Internal unexpected error'), {
      code: 'internal',
    });
    mockGetDoc.mockRejectedValueOnce(unknownError);

    let capturedErr: unknown = null;
    try {
      await gateway.getRenterProfile('renter-1');
    } catch (err) {
      capturedErr = err;
    }

    expect(capturedErr).toBeInstanceOf(RenterProfileError);
    expect((capturedErr as RenterProfileError).diagnosticCode).toBe('profile_read_failed');
  });

  it('classifies malformed document parse failures as profile_invalid_record', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        ...mockProfileData,
        phone: 'invalid-phone',
      }),
    });

    try {
      await gateway.getRenterProfile('renter-1');
      expect.fail('Expected getRenterProfile to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(RenterProfileError);
      expect((err as RenterProfileError).diagnosticCode).toBe('profile_invalid_record');
    }
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

describe('web preview renter profile boundary', () => {
  it('uses the deterministic preview adapter unless live dependencies are explicitly injected', async () => {
    const gateway = createRenterProfileGateway();

    expect(gateway).toBeInstanceOf(PreviewRenterProfileGateway);
    await expect(gateway.getRenterProfile('preview-renter')).resolves.toMatchObject({
      renterId: 'preview-renter',
      accountStatus: 'active',
    });
  });

  it('fails honestly instead of simulating profile mutations', async () => {
    const gateway = createRenterProfileGateway();

    await expect(
      gateway.requestDeletion({ confirmation: true, reason: 'Preview check' }),
    ).rejects.toThrow('unavailable in web preview mode');
  });
});
