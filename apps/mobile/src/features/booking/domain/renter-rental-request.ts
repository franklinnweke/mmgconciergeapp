import { LAGOS_AREA_LABELS, type LagosAreaLabel } from '@mmg/contracts';
import type {
  CreateRentalRequestData,
  RenterVisibleRentalRequest,
} from '@mmg/contracts/rental-request';

import { stateGroup, type RenterTrip } from './renter-trip';

export function resolveServiceAreaLabel(value: string | null | undefined): LagosAreaLabel | null {
  if (!value) return null;
  const trimmed = value.trim();
  if ((LAGOS_AREA_LABELS as readonly string[]).includes(trimmed)) {
    return trimmed as LagosAreaLabel;
  }
  const prefix = trimmed.split(',')[0]?.trim();
  if (prefix && (LAGOS_AREA_LABELS as readonly string[]).includes(prefix)) {
    return prefix as LagosAreaLabel;
  }
  return null;
}

export function mapRenterVisibleRentalRequest(request: RenterVisibleRentalRequest): RenterTrip {
  return {
    id: request.requestId,
    vehicleId: request.vehicleId,
    startDate: request.startDate,
    endDate: request.endDate,
    state: request.state,
    priceSnapshot: request.authoritativePriceSnapshot ?? request.estimatedPriceSnapshot,
    group: stateGroup(request.state),
    updatedAt: request.updatedAt,
    source: 'request',
    vehicleSnapshot: request.vehicleSnapshot,
    intentId: request.intentId,
    holdExpiresAt: request.holdExpiresAt,
    bookingId: request.bookingId,
    requestVersion: request.version,
  };
}

export function toCreateRentalRequestData(input: {
  vehicleId: string;
  startDate: string;
  endDate: string;
  contactPhone: string;
  serviceAreaLabel: LagosAreaLabel;
}): CreateRentalRequestData {
  return {
    vehicleId: input.vehicleId,
    startDate: input.startDate,
    endDate: input.endDate,
    contactPhone: input.contactPhone,
    serviceAreaLabel: input.serviceAreaLabel,
  };
}
