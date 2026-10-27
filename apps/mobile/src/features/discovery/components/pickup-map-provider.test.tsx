import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PickupPinMap } from './pickup-pin-map';

const mocks = vi.hoisted(() => ({ extra: { googleMapsIosConfigured: true } }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: mocks.extra } } }));
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Animated: { Value: class {}, parallel: () => ({ start: vi.fn() }), spring: vi.fn(), View: 'View' },
  StyleSheet: { absoluteFill: {}, create: (v: unknown) => v }, Text: 'Text', View: 'View',
}));
vi.mock('react-native-maps', () => ({ default: 'map', PROVIDER_GOOGLE: 'google' }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'icon' }));
vi.mock('@/components/pressable-scale', () => ({ PressableScale: 'button' }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let tree: ReactTestRenderer;
beforeEach(() => { mocks.extra.googleMapsIosConfigured = true; });
afterEach(async () => { if (tree) await act(async () => tree.unmount()); });
const props = { latitude: 6.45, longitude: 3.43, onCoordinatesChange: vi.fn() };
describe('pickup map provider boundary', () => {
  it('explicitly renders a Google map and keeps attribution padding', async () => {
    await act(async () => { tree = create(<PickupPinMap {...props} mapPadding={{ top: 40, right: 0, bottom: 300, left: 0 }} />); });
    expect(tree.root.findByType('map').props.provider).toBe('google');
    expect(tree.root.findByType('map').props.mapPadding.bottom).toBe(300);
  });
  it('does not fall back to MapKit or invent a pickup when iOS Maps is unconfigured', async () => {
    mocks.extra.googleMapsIosConfigured = false;
    await act(async () => { tree = create(<PickupPinMap {...props} />); });
    expect(tree.root.findAllByType('map')).toHaveLength(0);
    expect(JSON.stringify(tree.toJSON())).toContain('Map preview unavailable');
    expect(props.onCoordinatesChange).not.toHaveBeenCalled();
  });
});
