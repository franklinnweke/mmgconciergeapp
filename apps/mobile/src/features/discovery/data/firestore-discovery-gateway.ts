import { DiscoveryGateway, type VehicleSearchCriteria, type VehicleSummary } from '@mmg/contracts';
import {
  discoveryVehicleToSummary,
  getVehicleDetailsResultSchema,
  resolvePickupPlaceDataSchema,
  resolvePickupPlaceResultSchema,
  resolveSearchPlaceDataSchema,
  resolveSearchPlaceResultSchema,
  searchPickupPlacesDataSchema,
  searchPickupPlacesResultSchema,
  searchVehiclesDataSchema,
  searchVehiclesResultSchema,
  type ResolvePickupPlaceResult,
  type ResolveSearchPlaceResult,
  type SearchPickupPlacesResult,
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
    return result.vehicle
      ? discoveryVehicleToSummary(result.vehicle, result.vehicle.distanceKm)
      : null;
  }

  async resolveSearchPlace(query: string): Promise<ResolveSearchPlaceResult> {
    const data = resolveSearchPlaceDataSchema.parse({ query });
    const callable = httpsCallable(this.functions, 'resolveSearchPlace');
    const response = await callable(data);
    return parseCallableResult(
      resolveSearchPlaceResultSchema,
      response.data,
      'resolveSearchPlace',
    );
  }

  async searchPickupPlaces(data: { query: string; sessionToken?: string }): Promise<SearchPickupPlacesResult> {
    const validated = searchPickupPlacesDataSchema.parse(data);
    const callable = httpsCallable(this.functions, 'searchPickupPlaces');
    const response = await callable(validated);
    return parseCallableResult(
      searchPickupPlacesResultSchema,
      response.data,
      'searchPickupPlaces',
    );
  }

  async resolvePickupPlace(data: { placeId: string; sessionToken?: string }): Promise<ResolvePickupPlaceResult> {
    const validated = resolvePickupPlaceDataSchema.parse(data);
    const callable = httpsCallable(this.functions, 'resolvePickupPlace');
    const response = await callable(validated);
    return parseCallableResult(
      resolvePickupPlaceResultSchema,
      response.data,
      'resolvePickupPlace',
    );
  }
}

export function createDiscoveryGateway(): DiscoveryGateway {
  return new NativeFirestoreDiscoveryGateway();
}
