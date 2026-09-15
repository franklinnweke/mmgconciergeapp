import { useCallback, useEffect, useState } from 'react';
import { OwnerVisibleVehicle, VehicleVisibility } from '@mmg/contracts';

import { useAuth } from '@/core/auth/auth-context';
import { safeProviderError } from '@/core/errors/safe-provider-error';
import { createOwnerFleetGateway, OwnerFleetGateway } from '../data/owner-fleet-gateway';

export function useOwnerFleet(gateway: OwnerFleetGateway = createOwnerFleetGateway()) {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<OwnerVisibleVehicle[]>([]);
  const [loading, setLoading] = useState(Boolean(user?.uid));
  const [syncError, setSyncError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const uid = user?.uid;

  useEffect(() => {
    if (!uid) return;

    const unsubscribe = gateway.subscribeOwnerVehicles(
      uid,
      (fetched) => {
        setVehicles(fetched);
        setLoading(false);
        setSyncError(null);
      },
      (err) => {
        setLoading(false);
        setSyncError(safeProviderError(err, 'Unable to synchronize fleet records.'));
      },
    );

    return () => unsubscribe();
  }, [gateway, uid]);

  const toggleVisibility = useCallback(
    async (vehicle: OwnerVisibleVehicle): Promise<boolean> => {
      if (actionInProgress) return false;
      const targetVisibility: VehicleVisibility = vehicle.visibility === 'active' ? 'paused' : 'active';
      setActionInProgress(vehicle.vehicleId);
      setSyncError(null);

      try {
        await gateway.setVisibility({
          vehicleId: vehicle.vehicleId,
          expectedVersion: vehicle.version,
          visibility: targetVisibility,
        });
        return true;
      } catch (err: unknown) {
        setSyncError(safeProviderError(err, 'Failed to update vehicle visibility.'));
        return false;
      } finally {
        setActionInProgress(null);
      }
    },
    [actionInProgress, gateway],
  );

  return {
    vehicles: uid ? vehicles : [],
    loading: uid ? loading : false,
    syncError,
    actionInProgress,
    toggleVisibility,
  };
}
