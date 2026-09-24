import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RenterProfileRecord } from '@mmg/contracts';
import type { RenterProfileGateway } from '../data/renter-profile-gateway';
import { RenterProfileError } from '../data/renter-profile-record';
import { useRenterProfile } from './use-renter-profile';

const mocks = vi.hoisted(() => {
  let authValue = {
    signingOut: false,
    user: { uid: 'renter-123' } as { uid: string } | null,
  };

  return {
    getAuth: () => authValue,
    setAuth: (val: { signingOut: boolean; user: { uid: string } | null }) => {
      authValue = val;
    },
  };
});

vi.mock('../../../core/auth/auth-context', () => ({
  useAuth: () => mocks.getAuth(),
}));

vi.mock('../data/renter-profile-gateway', () => ({
  createRenterProfileGateway: vi.fn(() => ({
    getRenterProfile: vi.fn(),
    completeProfile: vi.fn(),
    requestDeletion: vi.fn(),
  })),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

const VALID_RECORD: RenterProfileRecord = {
  renterId: 'renter-123',
  fullName: 'Tunde Adeleke',
  email: 'tunde@example.com',
  phone: '+2348012345678',
  defaultDeliveryAddress: {
    streetAddress: '15 Queens Drive, Ikoyi',
    areaLabel: 'Ikoyi',
  },
  acceptedRenterTermsVersion: '2026-03-01',
  acceptedPrivacyNoticeVersion: '2026-03-01',
  accountStatus: 'active',
  deletionReason: null,
  deletionRequestedAt: null,
  profileVersion: 1,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-15T10:00:00.000Z',
};

describe('useRenterProfile hook lifecycle and diagnostics', () => {
  let latest: ReturnType<typeof useRenterProfile> | null = null;
  let renderer: ReactTestRenderer | null = null;

  function Probe({ gateway }: { gateway?: RenterProfileGateway }) {
    latest = useRenterProfile(gateway);
    return React.createElement('Probe');
  }

  beforeEach(() => {
    latest = null;
    renderer = null;
    mocks.setAuth({
      signingOut: false,
      user: { uid: 'renter-123' },
    });
  });

  afterEach(() => {
    renderer?.unmount();
    renderer = null;
  });

  it('hydrates profile successfully when document exists and is valid', async () => {
    const mockGateway: RenterProfileGateway = {
      getRenterProfile: vi.fn(async () => VALID_RECORD),
      completeProfile: vi.fn(),
      requestDeletion: vi.fn(),
    };

    await act(async () => {
      renderer = create(React.createElement(Probe, { gateway: mockGateway }));
    });
    await flushAsync();

    expect(latest?.isLoading).toBe(false);
    expect(latest?.errorMessage).toBeNull();
    expect(latest?.diagnosticCode).toBeNull();
    expect(latest?.profile).toEqual(VALID_RECORD);
  });

  it('returns null profile without error when document does not exist (snapshot.exists = false)', async () => {
    const mockGateway: RenterProfileGateway = {
      getRenterProfile: vi.fn(async () => null),
      completeProfile: vi.fn(),
      requestDeletion: vi.fn(),
    };

    await act(async () => {
      renderer = create(React.createElement(Probe, { gateway: mockGateway }));
    });
    await flushAsync();

    expect(latest?.isLoading).toBe(false);
    expect(latest?.profile).toBeNull();
    expect(latest?.errorMessage).toBeNull();
    expect(latest?.diagnosticCode).toBeNull();
  });

  it('sets safe permission error and diagnosticCode when permission is denied', async () => {
    const mockGateway: RenterProfileGateway = {
      getRenterProfile: vi.fn(async () => {
        throw new RenterProfileError(
          'profile_permission_denied',
          'Failed to load profile: permission denied.',
        );
      }),
      completeProfile: vi.fn(),
      requestDeletion: vi.fn(),
    };

    await act(async () => {
      renderer = create(React.createElement(Probe, { gateway: mockGateway }));
    });
    await flushAsync();

    expect(latest?.isLoading).toBe(false);
    expect(latest?.profile).toBeNull();
    expect(latest?.errorMessage).toBe('You do not have access to this information.');
    expect(latest?.diagnosticCode).toBe('profile_permission_denied');
  });

  it('sets safe unavailable error and diagnosticCode when service or network is unavailable', async () => {
    const mockGateway: RenterProfileGateway = {
      getRenterProfile: vi.fn(async () => {
        throw new RenterProfileError(
          'profile_unavailable',
          'Failed to load profile: network or service unavailable.',
        );
      }),
      completeProfile: vi.fn(),
      requestDeletion: vi.fn(),
    };

    await act(async () => {
      renderer = create(React.createElement(Probe, { gateway: mockGateway }));
    });
    await flushAsync();

    expect(latest?.isLoading).toBe(false);
    expect(latest?.profile).toBeNull();
    expect(latest?.errorMessage).toBe(
      'The service is unavailable. Check your connection and try again.',
    );
    expect(latest?.diagnosticCode).toBe('profile_unavailable');
  });

  it('sets safe fallback error and diagnosticCode on malformed document record', async () => {
    const mockGateway: RenterProfileGateway = {
      getRenterProfile: vi.fn(async () => {
        throw new RenterProfileError(
          'profile_invalid_record',
          'Renter profile record is incomplete or invalid.',
        );
      }),
      completeProfile: vi.fn(),
      requestDeletion: vi.fn(),
    };

    await act(async () => {
      renderer = create(React.createElement(Probe, { gateway: mockGateway }));
    });
    await flushAsync();

    expect(latest?.isLoading).toBe(false);
    expect(latest?.profile).toBeNull();
    expect(latest?.errorMessage).toBe('Failed to load profile.');
    expect(latest?.diagnosticCode).toBe('profile_invalid_record');
  });

  it('sets safe fallback error and diagnosticCode on identity mismatch', async () => {
    const mockGateway: RenterProfileGateway = {
      getRenterProfile: vi.fn(async () => {
        throw new RenterProfileError(
          'profile_identity_mismatch',
          'Renter profile identity does not match its document path.',
        );
      }),
      completeProfile: vi.fn(),
      requestDeletion: vi.fn(),
    };

    await act(async () => {
      renderer = create(React.createElement(Probe, { gateway: mockGateway }));
    });
    await flushAsync();

    expect(latest?.isLoading).toBe(false);
    expect(latest?.profile).toBeNull();
    expect(latest?.errorMessage).toBe('Failed to load profile.');
    expect(latest?.diagnosticCode).toBe('profile_identity_mismatch');
  });

  it('sets safe fallback error and profile_read_failed on unexpected provider error', async () => {
    const mockGateway: RenterProfileGateway = {
      getRenterProfile: vi.fn(async () => {
        throw new Error('Unexpected internal Firestore exception');
      }),
      completeProfile: vi.fn(),
      requestDeletion: vi.fn(),
    };

    await act(async () => {
      renderer = create(React.createElement(Probe, { gateway: mockGateway }));
    });
    await flushAsync();

    expect(latest?.isLoading).toBe(false);
    expect(latest?.profile).toBeNull();
    expect(latest?.errorMessage).toBe('Failed to load profile.');
    expect(latest?.diagnosticCode).toBe('profile_read_failed');
  });

  it('prevents stale profile exposure across auth UID transitions', async () => {
    const mockGateway: RenterProfileGateway = {
      getRenterProfile: vi.fn(async (uid: string) => {
        if (uid === 'renter-123') return VALID_RECORD;
        return { ...VALID_RECORD, renterId: uid, fullName: 'Second User' };
      }),
      completeProfile: vi.fn(),
      requestDeletion: vi.fn(),
    };

    await act(async () => {
      renderer = create(React.createElement(Probe, { gateway: mockGateway }));
    });
    await flushAsync();

    expect(latest?.profile?.fullName).toBe('Tunde Adeleke');

    // Switch auth UID to user-456
    mocks.setAuth({
      signingOut: false,
      user: { uid: 'user-456' },
    });

    await act(async () => {
      renderer?.update(React.createElement(Probe, { gateway: mockGateway }));
    });

    // Before or during async flush, previous user's profile is never shown
    await flushAsync();

    expect(latest?.profile?.fullName).toBe('Second User');
    expect(latest?.profile?.renterId).toBe('user-456');
  });

  it('returns clean empty state when user is not authenticated', async () => {
    mocks.setAuth({
      signingOut: false,
      user: null,
    });

    const mockGateway: RenterProfileGateway = {
      getRenterProfile: vi.fn(),
      completeProfile: vi.fn(),
      requestDeletion: vi.fn(),
    };

    await act(async () => {
      renderer = create(React.createElement(Probe, { gateway: mockGateway }));
    });
    await flushAsync();

    expect(mockGateway.getRenterProfile).not.toHaveBeenCalled();
    expect(latest?.isLoading).toBe(false);
    expect(latest?.profile).toBeNull();
    expect(latest?.errorMessage).toBeNull();
    expect(latest?.diagnosticCode).toBeNull();
  });
});
