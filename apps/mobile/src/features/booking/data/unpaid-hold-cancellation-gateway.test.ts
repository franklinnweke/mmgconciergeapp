import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cancelUnpaidHold } from './unpaid-hold-cancellation-gateway';

const mocks = vi.hoisted(() => ({ callable: vi.fn(), functions: vi.fn(), https: vi.fn() }));
vi.mock('@react-native-firebase/functions', () => ({ getFunctions: mocks.functions, httpsCallable: mocks.https }));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'a49bd1b3-5d05-4d8f-8996-b80d3104c07f' }));
beforeEach(() => { vi.clearAllMocks(); mocks.functions.mockReturnValue({ region: 'africa-south1' }); mocks.https.mockReturnValue(mocks.callable); });

const response = (intentId: string) => ({ data: {
  requestId: 'audit-request-1',
  result: { intentId, state: 'expired', cancelledAt: '2026-10-05T12:00:00Z', inventoryReleased: true },
} });

describe('native unpaid hold cancellation', () => {
  it('uses a stable retry key and sends only the intent ID to the trusted callable', async () => {
    mocks.callable.mockResolvedValue(response('hold-1'));
    await cancelUnpaidHold('hold-1');
    await cancelUnpaidHold('hold-1');
    expect(mocks.functions).toHaveBeenCalledWith(undefined, 'africa-south1');
    expect(mocks.https).toHaveBeenCalledWith(expect.anything(), 'cancelUnpaidBookingIntent');
    expect(mocks.callable.mock.calls[0][0]).toEqual(mocks.callable.mock.calls[1][0]);
    expect(mocks.callable.mock.calls[0][0].data).toEqual({ intentId: 'hold-1' });
  });

  it('rejects a response for another hold', async () => {
    mocks.callable.mockResolvedValue(response('wrong-hold'));
    await expect(cancelUnpaidHold('hold-1')).rejects.toThrow('does not match');
  });

  it('rejects paid-looking or malformed responses instead of claiming cancellation', async () => {
    const malformed = response('hold-1');
    malformed.data.result.state = 'paid';
    mocks.callable.mockResolvedValue(malformed);
    await expect(cancelUnpaidHold('hold-1')).rejects.toThrow();
  });
});
