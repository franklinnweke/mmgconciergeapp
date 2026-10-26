import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RenterPaymentCheckout } from './renter-payment-checkout';
import type { ReconcilePaymentResult } from '@mmg/contracts/payment';

const mocks = vi.hoisted(() => ({ initialize: vi.fn(), reconcile: vi.fn(), browser: vi.fn(), foreground: null as null | ((state: string) => void) }));
vi.mock('../data/payment-checkout-gateway', async () => ({
  ...(await import('../data/payment-checkout-gateway-core')),
  createPaymentCheckoutGateway: () => ({ initializePayment: mocks.initialize, reconcilePayment: mocks.reconcile }),
}));
vi.mock('expo-web-browser', () => ({ openAuthSessionAsync: mocks.browser }));
vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator', View: 'View', Text: 'Text', StyleSheet: { create: (value: unknown) => value },
  AppState: { addEventListener: (_name: string, listener: (state: string) => void) => { mocks.foreground = listener; return { remove: () => { mocks.foreground = null; } }; } },
}));
vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
vi.mock('@/components/pressable-scale', () => ({ PressableScale: 'button' }));
vi.mock('@/core/errors/safe-provider-error', () => ({ safeProviderError: (_error: unknown, fallback: string) => fallback }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let tree: ReactTestRenderer | undefined;
const pending: ReconcilePaymentResult = { requestId: 'command-one', result: { eventId: 'event-one', intentId: 'intent-one', paymentId: 'payment-one', paymentState: 'pending', providerStatus: 'ongoing', verification: 'not_succeeded' } };
async function mount(options: { expired?: boolean; onViewTrips?: () => void } = {}) {
  await act(async () => { tree = create(<RenterPaymentCheckout holdExpiresAt={new Date(Date.now() + (options.expired ? -60_000 : 600_000)).toISOString()} intentId="intent-one" mode="request_first" onRestartHold={vi.fn()} onViewTrips={options.onViewTrips ?? vi.fn()} />); });
}
function button(label: string) { return tree!.root.findAllByType('button').find((node) => node.props.accessibilityLabel === label); }
beforeEach(() => { vi.clearAllMocks(); mocks.reconcile.mockResolvedValue(pending); });
afterEach(async () => { if (tree) await act(async () => tree!.unmount()); tree = undefined; });
describe('trusted checkout recovery after process death', () => {
  it('recovers the existing in-flight payment on mount even after hold expiry', async () => {
    await mount({ expired: true });
    expect(mocks.reconcile).toHaveBeenCalledExactlyOnceWith('intent-one', expect.any(String));
    expect(mocks.initialize).not.toHaveBeenCalled(); expect(mocks.browser).not.toHaveBeenCalled();
    expect(button('Check payment status')).toBeDefined(); expect(button('Pay securely')).toBeUndefined();
    expect(JSON.stringify(tree!.toJSON())).not.toContain('no charge was taken');
  });
  it('unlocks initialization only after server NOT_FOUND on an unexpired intent', async () => {
    mocks.reconcile.mockRejectedValueOnce({ code: 'functions/not-found' }); await mount();
    expect(button('Pay securely')).toBeDefined(); expect(mocks.initialize).not.toHaveBeenCalled();
  });
  it.each(['functions/unavailable', 'functions/permission-denied', 'functions/internal'])('never offers a new charge after %s', async (code) => {
    mocks.reconcile.mockRejectedValueOnce({ code }); await mount();
    expect(button('Pay securely')).toBeUndefined(); expect(button('Check payment status')).toBeDefined();
  });
  it('returns to Trips only after trusted confirmed value delivery', async () => {
    const onViewTrips = vi.fn(); mocks.reconcile.mockResolvedValueOnce({ ...pending, result: { ...pending.result, paymentState: 'succeeded', providerStatus: 'success', verification: 'verified_success', valueDeliveryOutcome: 'confirmed' } });
    await mount({ onViewTrips }); expect(onViewTrips).toHaveBeenCalledOnce(); expect(mocks.initialize).not.toHaveBeenCalled();
  });
  it('keeps an ambiguous initialization failure in reconciliation instead of offering another charge', async () => {
    mocks.reconcile.mockRejectedValueOnce({ code: 'functions/not-found' }); mocks.initialize.mockRejectedValueOnce(new Error('lost response'));
    await mount(); await act(async () => { await button('Pay securely')!.props.onPress(); });
    expect(mocks.initialize).toHaveBeenCalledOnce(); expect(button('Pay securely')).toBeUndefined();
    expect(button('Check payment status')).toBeDefined();
  });
  it('does not navigate or apply a late reconciliation after unmount', async () => {
    let resolve!: (value: ReconcilePaymentResult) => void;
    mocks.reconcile.mockReturnValueOnce(new Promise((done) => { resolve = done; })); const onViewTrips = vi.fn();
    await mount({ onViewTrips }); await act(async () => { tree!.unmount(); tree = undefined; });
    await act(async () => { resolve({ ...pending, result: { ...pending.result, valueDeliveryOutcome: 'confirmed' } }); });
    expect(onViewTrips).not.toHaveBeenCalled();
  });
});
