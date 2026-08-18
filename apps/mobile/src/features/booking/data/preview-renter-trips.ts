import type { PriceSnapshot } from '@mmg/contracts';

import { stateGroup, type RenterTrip, type RenterTripState } from '../domain/renter-trip';
import { getPreviewVehicleById } from '../../discovery/data/preview-discovery-gateway';

const price: PriceSnapshot = {
  currency: 'NGN',
  chargedDays: 3,
  ownerDailyRateKobo: 38_500_000,
  baseRentalKobo: 115_500_000,
  deliveryFeeKobo: 0,
  serviceFeeBps: 800,
  serviceFeeFixedKobo: 0,
  serviceFeeKobo: 9_240_000,
  ownerCommissionBps: 1_500,
  ownerCommissionKobo: 17_325_000,
  ownerEarningsKobo: 98_175_000,
  renterTotalKobo: 124_740_000,
  configVersion: 'pricing-2026-08',
  termsVersion: 'terms-2026-08',
  cancellationPolicyVersion: 'cancellation-2026-08',
};

function trip(
  id: string,
  vehicleId: string,
  state: RenterTripState,
  startDate: string,
  endDate: string,
  updatedAt: string,
): RenterTrip {
  const vehicle = getPreviewVehicleById(vehicleId);
  if (!vehicle) throw new Error(`Missing preview vehicle ${vehicleId}.`);
  return {
    id,
    vehicleId,
    state,
    startDate,
    endDate,
    priceSnapshot: price,
    group: stateGroup(state),
    updatedAt,
    source: 'preview',
    vehicleSnapshot: {
      displayName: vehicle.displayName,
      areaLabel: vehicle.areaLabel,
      categoryLabel: vehicle.category === 'executive_suv' ? 'Executive SUV' : 'Executive saloon',
      imageKey: vehicle.imageKey,
    },
  };
}

export const previewRenterTrips: readonly RenterTrip[] = [
  trip('preview-checkout', 'preview-prado-pearl', 'checkout_pending', '2026-09-13', '2026-09-16', '2026-08-13T12:20:00.000Z'),
  trip('preview-in-progress', 'preview-prado-graphite', 'in_progress', '2026-08-12', '2026-08-15', '2026-08-13T12:18:00.000Z'),
  trip('preview-paid', 'preview-prado-250', 'paid_pending_owner', '2026-09-21', '2026-09-24', '2026-08-13T12:16:00.000Z'),
  trip('preview-confirmed', 'preview-prado-250', 'confirmed', '2026-10-02', '2026-10-05', '2026-08-13T12:12:00.000Z'),
  trip('preview-intervention', 'preview-prado-pearl', 'intervention_required', '2026-09-05', '2026-09-08', '2026-08-13T12:10:00.000Z'),
  trip('preview-refunded', 'preview-prado-250', 'refunded', '2026-08-02', '2026-08-05', '2026-08-13T12:04:00.000Z'),
];
