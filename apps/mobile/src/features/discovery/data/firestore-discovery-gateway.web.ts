import { DiscoveryGateway, type VehicleSearchCriteria, type VehicleSummary } from '@mmg/contracts';
import {
  discoveryVehicleToSummary,
  getVehicleDetailsResultSchema,
  searchVehiclesDataSchema,
  searchVehiclesResultSchema,
} from '@mmg/contracts/discovery';
import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';

import { parseCallableResult } from '../../../core/firebase/parse-callable-result';
import { previewDiscoveryGateway } from './preview-discovery-gateway';

/** Compatibility name retained; live web discovery also uses Functions now. */
export class WebFirestoreDiscoveryGateway implements DiscoveryGateway {
  constructor(private readonly customFunctions?: Functions) {}

  private get functions(): Functions {
    return this.customFunctions ?? getFunctions(undefined, 'africa-south1');
  }

  async getFeaturedVehicles(): Promise<readonly VehicleSummary[]> {
    const response = await httpsCallable(this.functions, 'searchVehicles')({});
    const result = parseCallableResult(searchVehiclesResultSchema, response.data, 'searchVehicles');
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
    const response = await httpsCallable(this.functions, 'searchVehicles')(data);
    const result = parseCallableResult(searchVehiclesResultSchema, response.data, 'searchVehicles');
    return result.vehicles.map((vehicle) => discoveryVehicleToSummary(vehicle, vehicle.distanceKm));
  }

  async getVehicleById(vehicleId: string): Promise<VehicleSummary | null> {
    const response = await httpsCallable(this.functions, 'getVehicleDetails')({ vehicleId });
    const result = parseCallableResult(
      getVehicleDetailsResultSchema,
      response.data,
      'getVehicleDetails',
    );
    return result.vehicle ? discoveryVehicleToSummary(result.vehicle) : null;
  }
}

export function createDiscoveryGateway(functions?: Functions): DiscoveryGateway {
  if (functions) return new WebFirestoreDiscoveryGateway(functions);
  return previewDiscoveryGateway;
}
