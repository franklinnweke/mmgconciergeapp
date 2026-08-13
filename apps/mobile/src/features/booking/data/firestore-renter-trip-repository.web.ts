import type { RenterTripRepository, RenterTripSnapshot } from './renter-trip-repository';

// Web previews stay on deterministic fixtures. This module must never import
// the native Firebase SDK.
export const renterTripRemoteEnabled = false;

export function subscribeToTrustedRenterTrips(
  _renterId: string,
  onSnapshotResult: (snapshot: RenterTripSnapshot) => void,
  _onError: (error: Error) => void,
) {
  onSnapshotResult({ trips: [], skippedInvalidCount: 0 });
  return () => {};
}

export const firestoreRenterTripRepository: RenterTripRepository = {
  subscribe: subscribeToTrustedRenterTrips,
};
