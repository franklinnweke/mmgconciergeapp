import { DiscoveryGateway, type VehicleSearchCriteria, type VehicleSummary } from '@mmg/contracts';
import {
  discoveryVehicleToSummary,
  getVehicleDetailsResultSchema,
  searchVehiclesDataSchema,
  searchVehiclesResultSchema,
} from '@mmg/contracts/discovery';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';

import { parseCallableResult } from '../../../core/firebase/parse-callable-result';

/**
 * Compatibility name retained for existing imports. Discovery no longer reads
 * Firestore directly: every renter list/search/detail request crosses the
 * authenticated App Check Function boundary.
 */
export class NativeFirestoreDiscoveryGateway implements DiscoveryGateway {
  private get functions() {
    return getFunctions(undefined, 'africa-south1');
  }

  async getFeaturedVehicles(): Promise<readonly VehicleSummary[]> {
    const callable = httpsCallable(this.functions, 'searchVehicles');
    const response = await callable({});
    const result = parseCallableResult(
      searchVehiclesResultSchema,
      response.data,
      'searchVehicles',
    );
    return result.vehicles.map((vehicle) => discoveryVehicleToSummary(vehicle, vehicle.distanceKm));
  }

  async searchVehicles(criteria: VehicleSearchCriteria): Promise<readonly VehicleSummary[]> {
    const data = searchVehiclesDataSchema.parse({
      query: criteria.query,
      category: criteria.category,
      areaLabel: criteria.areaLabel,
      minSeats: criteria.minSeats,
      minPriceKobo: criteria.minDailyRateKobo,
      maxPriceKobo: criteria.maxDailyRateKobo,
      originLat: criteria.originLat,
      originLng: criteria.originLng,
      radiusKm: criteria.radiusKm,
      startDate: criteria.startDate,
      endDate: criteria.endDate,
    });
    const callable = httpsCallable(this.functions, 'searchVehicles');
    const response = await callable(data);
    const result = parseCallableResult(
      searchVehiclesResultSchema,
      response.data,
      'searchVehicles',
    );
    return result.vehicles.map((vehicle) => discoveryVehicleToSummary(vehicle, vehicle.distanceKm));
  }

  async getVehicleById(vehicleId: string): Promise<VehicleSummary | null> {
    const callable = httpsCallable(this.functions, 'getVehicleDetails');
    const response = await callable({ vehicleId });
    const result = parseCallableResult(
      getVehicleDetailsResultSchema,
      response.data,
      'getVehicleDetails',
    );
    return result.vehicle ? discoveryVehicleToSummary(result.vehicle) : null;
  }
}

export function createDiscoveryGateway(): DiscoveryGateway {
  return new NativeFirestoreDiscoveryGateway();
}
