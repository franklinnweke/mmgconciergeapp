import { describe, expect, it, vi } from 'vitest';
import { createCompletionGateway } from './renter-completion-gateway-core';
import { createRenterCompletionGateway as createWebGateway } from './renter-completion-gateway.web';
import { canRenterConfirmCompletion } from '../domain/renter-trip-completion';
import { stateGroup } from '../domain/renter-trip';

const response = { requestId: 'command-1', result: {
  bookingId: 'booking-1', bookingState: 'completed', earningState: 'available', amountKobo: 1000, version: 3,
} } as const;
describe('renter completion boundary', () => {
  it('sends only booking ID and stable command metadata, then accepts trusted completion', async () => {
    const invoke = vi.fn().mockResolvedValue(response);
    const gateway = createCompletionGateway(invoke, () => 'completion_test_key_1');
    expect(await gateway.confirmCompletion('booking-1')).toEqual(response.result);
    expect(invoke).toHaveBeenCalledWith({ schemaVersion: 1, idempotencyKey: 'completion_test_key_1', data: { bookingId: 'booking-1' } });
    expect(stateGroup(response.result.bookingState)).toBe('past');
  });
  it('reuses the same key after ambiguous failure instead of issuing a new command', async () => {
    const invoke = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(response);
    const createKey = vi.fn(() => 'completion_retry_key_1');
    const gateway = createCompletionGateway(invoke, createKey);
    await expect(gateway.confirmCompletion('booking-1')).rejects.toThrow('offline');
    await gateway.confirmCompletion('booking-1');
    expect(invoke.mock.calls[0][0]).toEqual(invoke.mock.calls[1][0]);
    expect(createKey).toHaveBeenCalledTimes(1);
  });
  it.each([{}, { ...response, result: { ...response.result, bookingState: 'in_progress' } }, { ...response, result: { ...response.result, bookingId: 'other' } }])('rejects malformed or unrelated results', async (value) => {
    await expect(createCompletionGateway(async () => value).confirmCompletion('booking-1')).rejects.toThrow();
  });
  it('rejects an empty booking ID before calling the server', async () => {
    const invoke = vi.fn();
    await expect(createCompletionGateway(invoke).confirmCompletion('')).rejects.toThrow();
    expect(invoke).not.toHaveBeenCalled();
  });
  it('does not simulate completion on web', async () => {
    await expect(createWebGateway().confirmCompletion('booking-1')).rejects.toThrow(/native app/);
  });
  it('allows only trusted completion-pending bookings', () => {
    expect(canRenterConfirmCompletion({ source: 'trusted', state: 'completion_pending' })).toBe(true);
    for (const state of ['requested', 'confirmed', 'in_progress', 'completed', 'paid_conflict', 'expired'] as const) {
      expect(canRenterConfirmCompletion({ source: 'trusted', state })).toBe(false);
    }
    for (const source of ['preview', 'legacy', 'request'] as const) {
      expect(canRenterConfirmCompletion({ source, state: 'completion_pending' })).toBe(false);
    }
  });
});
