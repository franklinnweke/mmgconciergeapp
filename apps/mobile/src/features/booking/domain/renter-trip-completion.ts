import type { RenterTrip } from './renter-trip';

export function canRenterConfirmCompletion(trip: Pick<RenterTrip, 'source' | 'state'>) {
  return trip.source === 'trusted' && trip.state === 'completion_pending';
}
