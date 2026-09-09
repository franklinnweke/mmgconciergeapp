import { Timestamp } from 'firebase-admin/firestore';

function timestampIso(value: unknown): string | undefined {
  return value instanceof Timestamp ? value.toDate().toISOString() : undefined;
}

export function clientRentalRequestProjection(documentId: string, data: Record<string, unknown>) {
  return {
    requestId: typeof data.requestId === 'string' ? data.requestId : documentId,
    vehicleId: data.vehicleId,
    startDate: data.startDate,
    endDate: data.endDate,
    serviceAreaLabel: data.serviceAreaLabel,
    state: data.state,
    version: data.version,
    estimatedPriceSnapshot: data.estimatedPriceSnapshot,
    ...(data.authoritativePriceSnapshot ? { authoritativePriceSnapshot: data.authoritativePriceSnapshot } : {}),
    vehicleSnapshot: data.vehicleSnapshot,
    ...(typeof data.intentId === 'string' ? { intentId: data.intentId } : {}),
    ...(timestampIso(data.holdExpiresAt) ? { holdExpiresAt: timestampIso(data.holdExpiresAt) } : {}),
    ...(typeof data.bookingId === 'string' ? { bookingId: data.bookingId } : {}),
    createdAt: timestampIso(data.createdAt),
    updatedAt: timestampIso(data.updatedAt),
  };
}
