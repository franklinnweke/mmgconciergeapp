import { contrastRatio, darkThemeColors, lightThemeColors } from '@mmg/brand';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '../../../core/theme';
import BookingReviewScreen from './booking-review-screen';

const mockVehicle = {
  id: 'veh-1',
  make: 'Mercedes-Benz',
  model: 'S-Class',
  year: 2024,
  displayName: '2024 Mercedes-Benz S-Class',
  category: 'executive_sedan' as const,
  areaLabel: 'Ikoyi' as const,
  dailyRateKobo: 25000000,
  transmission: 'automatic' as const,
  fuelType: 'petrol' as const,
  seats: 4,
  features: [],
  primaryImageUrl: 'https://example.com/s-class.jpg',
};

const mocks = vi.hoisted(() => ({
  getVehicleById: vi.fn(),
  createRequest: vi.fn(),
  refreshRentalRequests: vi.fn(async () => {}),
}));

vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  ScrollView: 'ScrollView',
  StyleSheet: { create: <T,>(s: T) => s, hairlineWidth: 1 },
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
  useColorScheme: () => 'light',
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => {}) },
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ back: vi.fn(), replace: vi.fn() }),
}));

vi.mock('expo-image', () => ({ Image: 'Image' }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
vi.mock('../../../components/pressable-scale', () => ({ PressableScale: 'PressableScale' }));
vi.mock('../../../components/screen-header', () => ({ ScreenHeader: 'ScreenHeader' }));

vi.mock('../../../core/auth/auth-context', () => ({
  useAuth: () => ({
    signingOut: false,
    user: { uid: 'renter-1', emailVerified: true, displayName: 'Amara Nwosu' },
  }),
}));

vi.mock('../../account/hooks/use-renter-profile', () => ({
  useRenterProfile: () => ({
    profile: {
      renterId: 'renter-1',
      accountStatus: 'active',
      fullName: 'Amara Nwosu',
      phone: '+2348031234567',
      email: 'amara@example.com',
      acceptedRenterTermsVersion: '2026-03-01',
      acceptedPrivacyNoticeVersion: '2026-03-01',
      profileVersion: 1,
      createdAt: '2026-03-01T10:00:00.000Z',
      updatedAt: '2026-03-01T10:00:00.000Z',
    },
    saveProfile: vi.fn(async () => {}),
  }),
}));

vi.mock('../../discovery/data/firestore-discovery-gateway', () => ({
  createDiscoveryGateway: () => ({ getVehicleById: mocks.getVehicleById }),
}));

vi.mock('../../discovery/data/vehicle-images', () => ({
  resolveVehicleImageSource: (v: { primaryImageUrl?: string }) => ({ uri: v.primaryImageUrl }),
}));

vi.mock('../../discovery/components/pickup-location-sheet', () => ({
  PickupLocationSheet: 'PickupLocationSheet',
}));

vi.mock('../booking-context', () => ({
  useBookings: () => ({ refreshRentalRequests: mocks.refreshRentalRequests }),
}));

vi.mock('../data/rental-request-gateway', () => ({
  createRentalRequestGateway: () => ({ createRequest: mocks.createRequest }),
}));

vi.mock('../data/rental-request-attempt', () => ({
  completeRentalRequestAttempt: vi.fn(async () => {}),
  prepareRentalRequestAttempt: vi.fn(async () => 'key-1'),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let tree: ReactTestRenderer | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getVehicleById.mockResolvedValue(mockVehicle);
});

afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = undefined;
});

describe('BookingReviewScreen CTA contrast', () => {
  it.each(['light', 'dark'] as const)('renders Send request CTA at WCAG AA contrast in %s mode', async (mode) => {
    await act(async () => {
      tree = create(
        <ThemeProvider initialMode={mode}>
          <BookingReviewScreen
            endDate="2026-12-03"
            startDate="2026-12-01"
            vehicleId="veh-1"
          />
        </ThemeProvider>,
      );
    });

    const submitButton = tree!.root.findByProps({ testID: 'booking-review-submit' });
    const container = submitButton.findByType('View' as never);
    const label = submitButton.findByType('Text' as never);
    const containerStyles = Array.isArray(container.props.style) ? container.props.style : [container.props.style];
    const background = containerStyles.find((s) => s && typeof s === 'object' && 'backgroundColor' in s)!.backgroundColor;
    const foreground = label.props.style.color;
    const expected = mode === 'light' ? lightThemeColors : darkThemeColors;

    expect(background).toBe(expected.goldStrong);
    expect(foreground).toBe(expected.primaryContrast);
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });
});
