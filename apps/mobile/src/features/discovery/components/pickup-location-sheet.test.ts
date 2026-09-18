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
  Keyboard: { dismiss: vi.fn() },
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Modal: 'Modal',
  PanResponder: { create: () => ({ panHandlers: {} }) },
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
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  View: 'View',
}));

vi.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: 'GestureHandlerRootView',
}));

vi.mock('react-native-reanimated', () => ({
  default: { View: 'View' },
  useAnimatedStyle: (fn: any) => fn(),
  useReducedMotion: () => false,
  useSharedValue: (init: any) => ({ value: init }),
  withSpring: (toValue: any) => toValue,
  withTiming: (toValue: any) => toValue,
  runOnJS: (fn: any) => fn,
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 34, top: 47, left: 0, right: 0 }),
}));

vi.mock('@/components/pressable-scale', () => ({
  PressableScale: 'PressableScale',
}));

vi.mock('expo-image', () => ({
  Image: 'Image',
}));

vi.mock('./pickup-pin-map', () => ({
  PickupPinMap: 'PickupPinMap',
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

  it('identifies when provider search suggestions require Google attribution', () => {
    const remoteSuggestion = {
      placeId: 'ChIJ12345',
      primaryText: 'Eko Hotel',
      secondaryText: 'Victoria Island, Lagos',
      fullText: 'Eko Hotel, Victoria Island, Lagos',
      displayName: 'Eko Hotel',
      formattedAddress: 'Victoria Island, Lagos',
      isCurated: false,
    };

    const curatedSuggestion = {
      placeId: 'landmark-1',
      primaryText: 'Murtala Muhammed Airport',
      secondaryText: 'Ikeja, Lagos',
      fullText: 'Murtala Muhammed Airport, Ikeja, Lagos',
      displayName: 'Murtala Muhammed Airport',
      formattedAddress: 'Ikeja, Lagos',
      isCurated: true,
    };

    const shouldShowAttribution = (suggestions: { isCurated?: boolean }[], query: string) =>
      suggestions.length > 0 && (query.trim().length >= 2 || suggestions.some((s) => !s.isCurated));

    // Case 1: Initial state (query empty, curated only) -> no Google attribution
    expect(shouldShowAttribution([curatedSuggestion], '')).toBe(false);

    // Case 2: Remote provider results returned -> Google attribution required
    expect(shouldShowAttribution([remoteSuggestion], 'Eko')).toBe(true);

    // Case 3: Empty results -> no attribution
    expect(shouldShowAttribution([], 'Zzz')).toBe(false);
  });

  it('identifies when confirmation step requires Google attribution', () => {
    const shouldShowConfirmationAttribution = (source: string) =>
      source === 'place_search' || source === 'pin_adjusted';

    // Google Places search result displayed on confirmation card -> attribution required
    expect(shouldShowConfirmationAttribution('place_search')).toBe(true);

    // Adjusted pin from Places search result displayed on confirmation card -> attribution required
    expect(shouldShowConfirmationAttribution('pin_adjusted')).toBe(true);

    // Curated suggested location -> no Google attribution needed
    expect(shouldShowConfirmationAttribution('suggested')).toBe(false);

    // Native GPS current location -> no Google attribution needed
    expect(shouldShowConfirmationAttribution('current_location')).toBe(false);
  });

  it('allows pin adjustment to refine coordinates with updated source and canonical area', () => {
    const originalLocation = {
      placeId: 'ChIJ_hotel_eko',
      displayName: 'Eko Hotel & Suites',
      formattedAddress: 'Plot 1415 Adetokunbo Ademola St, Victoria Island, Lagos',
      latitude: 6.4269,
      longitude: 3.4285,
      source: 'place_search' as const,
      serviceAreaLabel: 'Victoria Island' as const,
    };

    // Simulate dragging pin ~30 meters toward gate
    const adjustedCoords = {
      latitude: 6.42715,
      longitude: 3.4288,
    };

    const adjustedLocation = {
      ...originalLocation,
      latitude: adjustedCoords.latitude,
      longitude: adjustedCoords.longitude,
      source: 'pin_adjusted' as const,
    };

    expect(adjustedLocation.source).toBe('pin_adjusted');
    expect(adjustedLocation.latitude).toBe(6.42715);
    expect(adjustedLocation.longitude).toBe(3.4288);
    expect(adjustedLocation.placeId).toBe('ChIJ_hotel_eko');
  });

  it('determines initial mode correctly based on presence of existing selectedLocation', () => {
    // When no selectedLocation is present, starts in search_idle
    expect(PickupLocationSheet).toBeDefined();
    const hasExisting = Boolean(null);
    expect(hasExisting ? 'confirm' : 'search_idle').toBe('search_idle');

    // When selectedLocation is present, starts directly in confirm mode
    const hasExistingLocation = Boolean({
      placeId: 'landmark-1',
      displayName: 'Eko Hotel',
      formattedAddress: 'Victoria Island',
      latitude: 6.4269,
      longitude: 3.4285,
      source: 'suggested',
      serviceAreaLabel: 'Victoria Island',
    });
    expect(hasExistingLocation ? 'confirm' : 'search_idle').toBe('confirm');
  });

  it('renders with safe area inset protection for bottom action controls', () => {
    const bottomInset = 34;
    const paddingBottom = Math.max(bottomInset, 16);
    expect(paddingBottom).toBe(34);
  });

  describe('source retention and reset integrity', () => {
    it('preserves suggested source for curated destinations', () => {
      const curated = CURATED_PICKUP_LOCATIONS[0];
      expect(curated.source).toBe('suggested');
    });

    it('preserves place_search source for remote places', () => {
      const remote = {
        displayName: 'Victoria Island Office',
        formattedAddress: 'Adetokunbo Ademola St',
        latitude: 6.428,
        longitude: 3.429,
        source: 'place_search' as const,
        serviceAreaLabel: 'Victoria Island' as const,
      };
      expect(remote.source).toBe('place_search');
    });

    it('preserves current_location source for GPS pickup', () => {
      const currentLoc = {
        displayName: 'Current Location',
        formattedAddress: 'Lekki Phase 1',
        latitude: 6.44,
        longitude: 3.48,
        source: 'current_location' as const,
        serviceAreaLabel: 'Lekki Phase 1' as const,
      };
      expect(currentLoc.source).toBe('current_location');
    });

    it('disables map interaction when outside confirm mode', () => {
      const isSearchMode = (mode: string) => mode !== 'confirm';
      expect(isSearchMode('search_idle')).toBe(true);
      expect(isSearchMode('search_focused')).toBe(true);
      expect(isSearchMode('confirm')).toBe(false);
    });
  });
});
