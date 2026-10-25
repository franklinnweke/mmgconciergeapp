import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TripPickupDetails } from './trip-pickup-details';

const mocks = vi.hoisted(() => ({ openURL: vi.fn().mockResolvedValue(undefined) }));
vi.mock('react-native', () => ({ Linking: mocks, StyleSheet: { create: (v: unknown) => v }, Text: 'Text', View: 'View' }));
vi.mock('@/components/pressable-scale', () => ({ PressableScale: 'button' }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let tree: ReactTestRenderer;
afterEach(async () => { if (tree) await act(async () => tree.unmount()); vi.clearAllMocks(); });
const pickup = { displayName: 'Gate', formattedAddress: 'Customer selected gate, Ikoyi', latitude: 6.45, longitude: 3.43, serviceAreaLabel: 'Ikoyi' as const, note: 'Side gate' };

describe('trip pickup details', () => {
  it('shows the confirmed pickup, note and Lagos time and only opens directions on tap', async () => {
    await act(async () => { tree = create(<TripPickupDetails pickup={pickup} time="09:30" />); });
    expect(JSON.stringify(tree.toJSON())).toContain('Side gate');
    expect(JSON.stringify(tree.toJSON())).toContain('09:30 WAT');
    expect(mocks.openURL).not.toHaveBeenCalled();
    await act(async () => tree.root.findByType('button').props.onPress());
    expect(mocks.openURL).toHaveBeenCalledWith(expect.stringContaining('destination=6.45%2C3.43'));
  });
  it('shows a truthful missing state without a fake pin or navigation action', async () => {
    await act(async () => { tree = create(<TripPickupDetails />); });
    expect(JSON.stringify(tree.toJSON())).toContain('Pickup not recorded');
    expect(tree.root.findAllByType('button')).toHaveLength(0);
  });
  it('keeps a navigation failure quiet and retryable', async () => {
    mocks.openURL.mockRejectedValueOnce(new Error('unavailable'));
    await act(async () => { tree = create(<TripPickupDetails pickup={pickup} />); });
    await act(async () => tree.root.findByType('button').props.onPress());
    expect(JSON.stringify(tree.toJSON())).toContain('Directions could not open');
    expect(tree.root.findAllByType('button')).toHaveLength(1);
  });
});
