import { VehicleCategory, VehicleSummary } from '@mmg/contracts';
import { useEffect, useState } from 'react';

import { createDiscoveryGateway } from '../data/firestore-discovery-gateway';

export type VehicleSearchInput = {
  areaLabel?: string;
  category?: VehicleCategory;
  query: string;
  minSeats?: number;
  minDailyRateKobo?: number;
  maxDailyRateKobo?: number;
  originLat?: number;
  originLng?: number;
  radiusKm?: number;
};

export function useVehicleSearch(criteria: VehicleSearchInput) {
  const [state, setState] = useState<{
    isLoading: boolean;
    vehicles: readonly VehicleSummary[];
    error: string | null;
  }>({
    isLoading: true,
    vehicles: [],
    error: null,
  });

  const {
    areaLabel,
    category,
    query,
    minSeats,
    minDailyRateKobo,
    maxDailyRateKobo,
    originLat,
    originLng,
    radiusKm,
  } = criteria;

  useEffect(() => {
    let isMounted = true;
    const gateway = createDiscoveryGateway();

    gateway
      .searchVehicles({
        areaLabel,
        category,
        query,
        minSeats,
        minDailyRateKobo,
        maxDailyRateKobo,
        originLat,
        originLng,
        radiusKm,
      })
      .then((results) => {
        if (isMounted) {
          setState({ error: null, isLoading: false, vehicles: results });
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setState({
            error: err instanceof Error ? err.message : 'Search query failed.',
            isLoading: false,
            vehicles: [],
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [
    areaLabel,
    category,
    query,
    minSeats,
    minDailyRateKobo,
    maxDailyRateKobo,
    originLat,
    originLng,
    radiusKm,
  ]);

  return { error: state.error, isLoading: state.isLoading, vehicles: state.vehicles };
}
