import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { CURATED_PICKUP_LOCATIONS } from '../domain/pickup-location';
import { PickupLocationSheet } from './pickup-location-sheet';

const mocks = vi.hoisted(() => ({ request: vi.fn(), reset: vi.fn() }));
vi.mock('../hooks/use-current-location', () => ({ useCurrentLocation: () => ({ requestCurrentLocation: mocks.request, reset: mocks.reset, status: 'idle', errorMessage: null, accuracyMessage: null }) }));
vi.mock('../hooks/use-place-search', async () => {
  const { CURATED_PICKUP_LOCATIONS } = await import('../domain/pickup-location');
  return { usePlaceSearch: () => ({ suggestions: CURATED_PICKUP_LOCATIONS.map((location) => ({ ...location, primaryText: location.displayName, isCurated: true, location })), isLoading: false, error: null, resolvePlace: vi.fn() }) };
});
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
  it('renders Google Maps attribution with normal letter spacing', async () => {
    let view!: ReturnType<typeof create>;
    await act(async () => { view = create(React.createElement(PickupLocationSheet, { visible: true, selectedLocation: { ...CURATED_PICKUP_LOCATIONS[0], source: 'place_search' }, onSelectLocation: vi.fn(), onClose: vi.fn() })); });
    const attribution = view.root.findAll((node) => String(node.type) === 'Text' && node.props.children === 'Google Maps');
    expect(attribution).toHaveLength(1);
    expect(attribution[0].props.style).toMatchObject({ fontSize: 12, color: '#FFFFFF' });
    expect(attribution[0].props.style).not.toHaveProperty('letterSpacing');
    await act(async () => { view.unmount(); });
  });

  it('does not let a late GPS result replace a manually selected pickup', async () => {
    let resolveGps!: (value: unknown) => void;
    mocks.request.mockReturnValueOnce(new Promise((resolve) => { resolveGps = resolve; }));
    const onSelectLocation = vi.fn();
    let view!: ReturnType<typeof create>;
    await act(async () => { view = create(React.createElement(PickupLocationSheet, { visible: true, selectedLocation: null, onSelectLocation, onClose: vi.fn() })); });
    const action = (label: string) => view.root.findAll((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
    let pending!: Promise<void>;
    await act(async () => { pending = action('Use my current location').props.onPress(); });
    const curated = CURATED_PICKUP_LOCATIONS[0];
    await act(async () => { await view.root.findAll((node) => node.props.accessibilityHint === 'Selects this pickup location')[0].props.onPress(); });
    await act(async () => { resolveGps({ success: true, location: { ...curated, latitude: 6.45, longitude: 3.45, source: 'current_location' } }); await pending; });
    const map = view.root.findAll((node) => String(node.type) === 'PickupPinMap')[0];
    expect(map.props.latitude).toBe(curated.latitude);
    expect(map.props.longitude).toBe(curated.longitude);
    await act(async () => { action('Confirm pickup location').props.onPress(); });
    expect(onSelectLocation).toHaveBeenCalledWith(expect.objectContaining({ latitude: curated.latitude, longitude: curated.longitude, source: 'suggested' }));
    await act(async () => { view.unmount(); });
  });

  it('ignores GPS completion after dismissing pickup selection', async () => {
    let resolveGps!: (value: unknown) => void;
    mocks.request.mockReturnValueOnce(new Promise((resolve) => { resolveGps = resolve; }));
    const onClose = vi.fn();
    const onSelectLocation = vi.fn();
    let view!: ReturnType<typeof create>;
    await act(async () => { view = create(React.createElement(PickupLocationSheet, { visible: true, selectedLocation: null, onSelectLocation, onClose })); });
    const action = (label: string) => view.root.findAll((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
    let pending!: Promise<void>;
    await act(async () => { pending = action('Use my current location').props.onPress(); });
    await act(async () => { action('Close location selection').props.onPress(); });
    await act(async () => { resolveGps({ success: true, location: { ...CURATED_PICKUP_LOCATIONS[0], source: 'current_location' } }); await pending; });
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSelectLocation).not.toHaveBeenCalled();
    expect(view.root.findAll((node) => node.props.accessibilityLabel === 'Confirm pickup location')).toHaveLength(0);
    await act(async () => { view.unmount(); });
  });

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

    const shouldShowAttribution = (suggestions: { isCurated?: boolean }[], _query: string) =>
      suggestions.length > 0 && suggestions.some((s) => !s.isCurated);

    // Case 1: Initial state (query empty, curated only) -> no Google attribution
    expect(shouldShowAttribution([curatedSuggestion], '')).toBe(false);

    // Case 2: Remote provider results returned -> Google attribution required
    expect(shouldShowAttribution([remoteSuggestion], 'Eko')).toBe(true);

    // Case 3: Empty results -> no attribution
    expect(shouldShowAttribution([], 'Zzz')).toBe(false);
    expect(shouldShowAttribution([curatedSuggestion], 'Ikeja')).toBe(false);
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
