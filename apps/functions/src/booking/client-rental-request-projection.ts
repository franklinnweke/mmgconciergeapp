import { Timestamp } from 'firebase-admin/firestore';

function timestampIso(value: unknown): string | undefined {
  return value instanceof Timestamp ? value.toDate().toISOString() : undefined;
}

export function clientRentalRequestProjection(
  documentId: string,
  data: Record<string, unknown>,
  options?: { audience?: 'renter' | 'owner'; includePickupDispatch?: boolean },
) {
  const cancellationRequestedAt = timestampIso(data.cancellationRequestedAt);
  const state = cancellationRequestedAt && (data.state === 'ready_for_payment' || data.state === 'confirmed')
    ? 'cancellation_requested'
    : data.state;

  return {
    requestId: typeof data.requestId === 'string' ? data.requestId : documentId,
    vehicleId: data.vehicleId,
    startDate: data.startDate,
    endDate: data.endDate,
    serviceAreaLabel: data.serviceAreaLabel,
    state,
    version: data.version,
    estimatedPriceSnapshot: data.estimatedPriceSnapshot,
    ...(data.authoritativePriceSnapshot ? { authoritativePriceSnapshot: data.authoritativePriceSnapshot } : {}),
    vehicleSnapshot: data.vehicleSnapshot,
    ...(typeof data.intentId === 'string' ? { intentId: data.intentId } : {}),
    ...(timestampIso(data.holdExpiresAt) ? { holdExpiresAt: timestampIso(data.holdExpiresAt) } : {}),
    ...(typeof data.bookingId === 'string' ? { bookingId: data.bookingId } : {}),
    ...(cancellationRequestedAt ? { cancellationRequestedAt } : {}),
    ...(timestampIso(data.cancelledAt) ? { cancelledAt: timestampIso(data.cancelledAt) } : {}),
    createdAt: timestampIso(data.createdAt),
    updatedAt: timestampIso(data.updatedAt),
    ...(options?.audience === 'renter' && data.pickupLocation ? { pickupLocation: data.pickupLocation } : {}),
    ...(options?.audience === 'renter' && options.includePickupDispatch && data.confirmedPickupTime
      ? { confirmedPickupTime: data.confirmedPickupTime } : {}),
  };
}
