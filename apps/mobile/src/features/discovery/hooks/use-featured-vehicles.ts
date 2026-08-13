import { VehicleSummary } from '@mmg/contracts';
import { useEffect, useState } from 'react';

import { previewDiscoveryGateway } from '../data/preview-discovery-gateway';

export function useFeaturedVehicles() {
  const [vehicles, setVehicles] = useState<readonly VehicleSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    previewDiscoveryGateway
      .getFeaturedVehicles()
      .then((results) => {
        if (isMounted) {
          setVehicles(results);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return { isLoading, vehicles };
}
