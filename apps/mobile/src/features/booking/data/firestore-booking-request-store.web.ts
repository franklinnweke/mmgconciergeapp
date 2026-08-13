import type { BookingRequest } from '@mmg/contracts';

// Web uses a deterministic preview identity rather than Firebase Authentication,
// so it intentionally exercises the local cache only.
export const bookingRemoteEnabled = false;

export function subscribeToRemoteBookingRequests(
  _userId: string,
  _onRequests: (requests: BookingRequest[]) => void,
  _onError: (error: Error) => void,
) {
  return () => {};
}

export async function createRemoteBookingRequest(_request: BookingRequest) {}
