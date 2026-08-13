import { VehicleCategory } from '@mmg/contracts';
import { useMemo } from 'react';

import { filterPreviewVehicles } from '../data/preview-discovery-gateway';

type VehicleSearchInput = {
  areaLabel?: string;
  category?: VehicleCategory;
  query: string;
};

export function useVehicleSearch({ areaLabel, category, query }: VehicleSearchInput) {
  const vehicles = useMemo(
    () => filterPreviewVehicles({ areaLabel, category, query }),
    [areaLabel, category, query],
  );

  return { isLoading: false, vehicles };
}
