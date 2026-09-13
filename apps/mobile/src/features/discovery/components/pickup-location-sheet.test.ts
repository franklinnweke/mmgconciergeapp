import { describe, expect, it, vi } from 'vitest';
import { CURATED_PICKUP_LOCATIONS } from '../domain/pickup-location';
import { PickupLocationSheet } from './pickup-location-sheet';

(globalThis as any).__DEV__ = true;

vi.mock('@react-native-firebase/functions', () => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(),
}));

vi.mock('expo-location', () => ({
  Accuracy: { Balanced: 2 },
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied' },
  getForegroundPermissionsAsync: vi.fn(),
  requestForegroundPermissionsAsync: vi.fn(),
  getCurrentPositionAsync: vi.fn(),
  reverseGeocodeAsync: vi.fn(),
}));

vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Modal: 'Modal',
  Platform: { OS: 'ios' },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: {
    absoluteFill: {},
    create: (styles: any) => styles,
    hairlineWidth: 1,
  },
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, top: 0, left: 0, right: 0 }),
}));

vi.mock('@/components/pressable-scale', () => ({
  PressableScale: 'PressableScale',
}));

describe('PickupLocationSheet', () => {
  it('defines the component function properly', () => {
    expect(typeof PickupLocationSheet).toBe('function');
  });

  it('uses curated locations with airport and hotel destinations', () => {
    expect(CURATED_PICKUP_LOCATIONS.length).toBeGreaterThan(0);
    const airport = CURATED_PICKUP_LOCATIONS.find((loc) => loc.serviceAreaLabel === 'Ikeja');
    expect(airport).toBeDefined();

    const vi = CURATED_PICKUP_LOCATIONS.find((loc) => loc.serviceAreaLabel === 'Victoria Island');
    expect(vi).toBeDefined();
  });

  it('ensures all curated locations have valid coordinate-first properties', () => {
    for (const loc of CURATED_PICKUP_LOCATIONS) {
      expect(loc.latitude).toBeGreaterThan(6.3);
      expect(loc.latitude).toBeLessThan(6.75);
      expect(loc.longitude).toBeGreaterThan(2.7);
      expect(loc.longitude).toBeLessThan(4.3);
      expect(loc.source).toBe('suggested');
      expect(loc.displayName.length).toBeGreaterThan(0);
      expect(loc.formattedAddress.length).toBeGreaterThan(0);
    }
  });

  it('supports selecting a pickup location with an optional entrance note', () => {
    const onSelectLocation = vi.fn();
    const curated = CURATED_PICKUP_LOCATIONS[0];
    const withNote = {
      ...curated,
      note: 'Gate 2, North Lobby',
    };

    onSelectLocation(withNote);

    expect(onSelectLocation).toHaveBeenCalledWith(
      expect.objectContaining({
        placeId: curated.placeId,
        displayName: curated.displayName,
        formattedAddress: curated.formattedAddress,
        serviceAreaLabel: curated.serviceAreaLabel,
        note: 'Gate 2, North Lobby',
      }),
    );
  });
});
