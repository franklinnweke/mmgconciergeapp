import { describe, expect, it, vi } from 'vitest';
import { CURATED_PICKUP_LOCATIONS, DEFAULT_PICKUP_LOCATION } from '../domain/pickup-location';
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

  it('has default pickup location set to a valid Lagos location', () => {
    expect(DEFAULT_PICKUP_LOCATION).toBeDefined();
    expect(DEFAULT_PICKUP_LOCATION.displayName).toBe('Eko Hotel & Suites');
    expect(DEFAULT_PICKUP_LOCATION.serviceAreaLabel).toBe('Victoria Island');
  });
});
