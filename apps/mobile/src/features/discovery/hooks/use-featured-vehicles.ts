import { VehicleSummary } from '@mmg/contracts';
import { useEffect, useState } from 'react';

import { createDiscoveryGateway } from '../data/firestore-discovery-gateway';
import { safeProviderError } from '@/core/errors/safe-provider-error';

export function useFeaturedVehicles() {
  const [vehicles, setVehicles] = useState<readonly VehicleSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const gateway = createDiscoveryGateway();

    gateway
      .getFeaturedVehicles()
      .then((results) => {
        if (isMounted) {
          setVehicles(results);
          setError(null);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setError(safeProviderError(err, 'Failed to retrieve available fleet.'));
          setVehicles([]);
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return { error, isLoading, vehicles };
}
