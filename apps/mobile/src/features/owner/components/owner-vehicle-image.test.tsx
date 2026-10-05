import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OwnerVehicleImage, ownerImagePreviewCache } from './owner-vehicle-image';
import { ownerImageTimings } from '../data/owner-image-timings';

vi.mock('react-native', () => ({
  View: 'View',
  ActivityIndicator: 'ActivityIndicator',
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
    absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  },
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

const { clearMemoryCache } = vi.hoisted(() => ({
  clearMemoryCache: vi.fn(async () => true),
}));

vi.mock('expo-image', () => {
  const MockImage = (props: Record<string, unknown>) => React.createElement('Image', props);
  MockImage.clearMemoryCache = clearMemoryCache;
  return {
    Image: MockImage,
  };
});

const mockAuth = {
  user: { uid: 'owner-123' },
  signingOut: false,
};

vi.mock('@/core/auth/auth-context', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('../data/owner-image-preview-gateway', () => ({
  fetchOwnerImagePreview: vi.fn(async (vehicleId: string) => ({
    url: `https://storage.googleapis.com/preview/${vehicleId}.jpg`,
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
  })),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('OwnerVehicleImage component', () => {
  beforeEach(() => {
    mockAuth.user = { uid: 'owner-123' };
    mockAuth.signingOut = false;
    ownerImagePreviewCache.setSession('owner-123');
    ownerImageTimings.clear();
  });

  it('renders unavailable state when vehicle has no primary image path', async () => {
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <OwnerVehicleImage vehicle={{ vehicleId: 'veh-none', primaryImagePath: null }} />,
      );
    });

    const ionicons = renderer!.root.findAllByType('Ionicons' as never);
    expect(ionicons.length).toBe(1);
    expect(ionicons[0].props.accessibilityLabel).toBe('Vehicle photo unavailable');

    const spinner = renderer!.root.findAllByType('ActivityIndicator' as never);
    expect(spinner.length).toBe(0);

    const images = renderer!.root.findAllByType('Image' as never);
    expect(images.length).toBe(0);
  });

  it('renders quiet loading indicator while resolving and mounts Image with cachePolicy="memory"', async () => {
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <OwnerVehicleImage
          vehicle={{ vehicleId: 'veh-1', primaryImagePath: 'private/path/card' }}
        />
      );
    });

    // The image should be mounted with cachePolicy="memory"
    const images = renderer!.root.findAllByType('Image' as never);
    expect(images.length).toBe(1);
    expect(images[0].props.cachePolicy).toBe('memory');
    expect(images[0].props.source).toEqual({
      uri: 'https://storage.googleapis.com/preview/veh-1.jpg',
    });

    // Simulate image loaded
    await act(async () => {
      images[0].props.onLoad();
    });

    // Loading indicator should now be unmounted
    const spinners = renderer!.root.findAllByType('ActivityIndicator' as never);
    expect(spinners.length).toBe(0);

    // Verify timing measurement recorded the load
    const recent = ownerImageTimings.getRecent();
    expect(recent.length).toBe(1);
    expect(recent[0].vehicleId).toBe('veh-1');
    expect(recent[0].isRepeat).toBe(false);
  });

  it('falls back quietly to unavailable state when image loading fails after retry', async () => {
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <OwnerVehicleImage
          vehicle={{ vehicleId: 'veh-fail', primaryImagePath: 'private/fail/card' }}
        />
      );
    });

    const images = renderer!.root.findAllByType('Image' as never);
    expect(images.length).toBe(1);

    // Trigger error on first attempt (retry = 0 -> retry = 1)
    await act(async () => {
      images[0].props.onError();
    });

    // Trigger error on retry attempt (retry = 1 -> unavailable)
    const retryImages = renderer!.root.findAllByType('Image' as never);
    if (retryImages.length > 0) {
      await act(async () => {
        retryImages[0].props.onError();
      });
    }

    const ionicons = renderer!.root.findAllByType('Ionicons' as never);
    expect(ionicons.length).toBe(1);
    expect(ionicons[0].props.accessibilityLabel).toBe('Vehicle photo unavailable');
  });

  it('clears image memory cache and timings on sign-out / session change', async () => {
    clearMemoryCache.mockClear();

    ownerImagePreviewCache.setSession('owner-1');
    expect(clearMemoryCache).toHaveBeenCalledTimes(1);

    ownerImagePreviewCache.setSession(null);
    expect(clearMemoryCache).toHaveBeenCalledTimes(2);
  });
});
