import { expect, it, vi } from 'vitest';
import { createRenterCompletionGateway } from './renter-completion-gateway';

const mocks = vi.hoisted(() => ({ callable: vi.fn(), getFunctions: vi.fn(() => ({})), httpsCallable: vi.fn() }));
vi.mock('@react-native-firebase/functions', () => ({
  getFunctions: mocks.getFunctions,
  httpsCallable: (...args: unknown[]) => { mocks.httpsCallable(...args); return mocks.callable; },
}));
it('uses the existing africa-south1 completion callable', async () => {
  mocks.callable.mockResolvedValueOnce({ data: { requestId: 'command-1', result: {
    bookingId: 'booking-1', bookingState: 'completed', earningState: 'available', amountKobo: 1000, version: 3,
  } } });
  await createRenterCompletionGateway().confirmCompletion('booking-1');
  expect(mocks.getFunctions).toHaveBeenCalledWith(undefined, 'africa-south1');
  expect(mocks.httpsCallable).toHaveBeenCalledWith({}, 'confirmBookingCompletion');
});
