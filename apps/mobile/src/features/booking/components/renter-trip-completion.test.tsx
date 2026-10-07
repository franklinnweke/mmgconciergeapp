import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RenterTripCompletion } from './renter-trip-completion';

const mocks = vi.hoisted(() => ({ alert: vi.fn() }));
vi.mock('react-native', () => ({
  Alert: { alert: mocks.alert }, StyleSheet: { create: (value: unknown) => value },
  Text: 'Text', View: 'View',
}));
vi.mock('@/components/pressable-scale', () => ({ PressableScale: 'button' }));
vi.mock('@/core/errors/safe-provider-error', () => ({ safeProviderError: (_error: unknown, fallback: string) => fallback }));
vi.mock('../data/renter-completion-gateway', () => ({ createRenterCompletionGateway: vi.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let tree: ReactTestRenderer;
beforeEach(() => vi.clearAllMocks());
afterEach(async () => { if (tree) await act(async () => tree.unmount()); });
async function setup() {
  const confirmCompletion = vi.fn().mockResolvedValue({ bookingId: 'booking-1', bookingState: 'completed' });
  const onCompleted = vi.fn().mockResolvedValue(undefined);
  await act(async () => { tree = create(<RenterTripCompletion bookingId="booking-1" disabled={false} gateway={{ confirmCompletion }} onCompleted={onCompleted} />); });
  await act(async () => tree.root.findByType('button').props.onPress());
  const buttons = mocks.alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
  return { confirmCompletion, onCompleted, buttons };
}
describe('trip completion confirmation', () => {
  it('does not mutate until the renter explicitly confirms', async () => {
    const { confirmCompletion, buttons } = await setup();
    expect(buttons[0].text).toBe('Not yet');
    expect(buttons[0].onPress).toBeUndefined();
    expect(confirmCompletion).not.toHaveBeenCalled();
  });
  it('deduplicates rapid confirmations and refreshes only after server success', async () => {
    const { confirmCompletion, onCompleted, buttons } = await setup();
    await act(async () => { buttons[1].onPress!(); buttons[1].onPress!(); });
    expect(confirmCompletion).toHaveBeenCalledTimes(1);
    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(tree.root.findAllByType('button')).toHaveLength(0);
    await act(async () => buttons[1].onPress!());
    expect(confirmCompletion).toHaveBeenCalledTimes(1);
  });
  it('keeps failed completion retryable and does not refresh as though it succeeded', async () => {
    const { confirmCompletion, onCompleted, buttons } = await setup();
    confirmCompletion.mockRejectedValueOnce(new Error('permission denied'));
    await act(async () => buttons[1].onPress!());
    expect(onCompleted).not.toHaveBeenCalled();
    expect(tree.root.findAllByType('button')).toHaveLength(1);
    expect(JSON.stringify(tree.toJSON())).toContain('Completion could not be verified');
  });
  it('does not mislabel a refresh failure after trusted completion as a failed mutation', async () => {
    const { onCompleted, buttons } = await setup();
    onCompleted.mockRejectedValueOnce(new Error('offline'));
    await act(async () => buttons[1].onPress!());
    expect(JSON.stringify(tree.toJSON())).toContain('Trip completed. Refresh Trips');
    expect(tree.root.findAllByType('button')).toHaveLength(0);
  });
});
