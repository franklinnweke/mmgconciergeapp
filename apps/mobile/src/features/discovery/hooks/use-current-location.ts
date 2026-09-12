import { useCallback, useState } from 'react';
import * as Location from 'expo-location';
import { isWithinLagosBBox } from '@mmg/domain';

import {
  deriveLagosAreaLabel,
  type PickupLocation,
} from '../domain/pickup-location';

export type CurrentLocationStatus =
  | 'idle'
  | 'requesting'
  | 'success'
  | 'denied'
  | 'outside_lagos'
  | 'error';

export type CurrentLocationResult =
  | { success: true; location: PickupLocation }
  | { success: false; reason: 'denied' | 'outside_lagos' | 'error'; message: string };

export function useCurrentLocation() {
  const [status, setStatus] = useState<CurrentLocationStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const requestCurrentLocation = useCallback(async (): Promise<CurrentLocationResult> => {
    setStatus('requesting');
    setErrorMessage(null);

    try {
      // 1. Explicit on-demand foreground location permission
      const { status: existingStatus } = await Location.getForegroundPermissionsAsync();
      let finalStatus = existingStatus;

      if (finalStatus !== Location.PermissionStatus.GRANTED) {
        const { status: requestedStatus } = await Location.requestForegroundPermissionsAsync();
        finalStatus = requestedStatus;
      }

      if (finalStatus !== Location.PermissionStatus.GRANTED) {
        const msg = 'Location permission was denied. Please search for an address or place instead.';
        setStatus('denied');
        setErrorMessage(msg);
        return { success: false, reason: 'denied', message: msg };
      }

      // 2. Fetch current coordinates
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude, longitude } = position.coords;

      // 3. Lagos bounding box validation
      if (!isWithinLagosBBox(latitude, longitude)) {
        const msg = 'MMG currently serves pickups within Lagos. Choose a Lagos pickup location instead.';
        setStatus('outside_lagos');
        setErrorMessage(msg);
        return { success: false, reason: 'outside_lagos', message: msg };
      }

      // 4. Derive canonical service area from nearest Lagos centroid
      const serviceAreaLabel = deriveLagosAreaLabel({ lat: latitude, lng: longitude });
      if (!serviceAreaLabel) {
        const msg = 'MMG could not resolve a serviceable Lagos area for this location.';
        setStatus('outside_lagos');
        setErrorMessage(msg);
        return { success: false, reason: 'outside_lagos', message: msg };
      }

      // 5. Reverse geocode to resolve human-readable address
      let displayName = 'Current Location';
      let formattedAddress = `${serviceAreaLabel}, Lagos`;

      try {
        const geocoded = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geocoded && geocoded.length > 0) {
          const first = geocoded[0];
          const namePart = first.name || first.street;
          const districtPart = first.district || first.subregion || first.city;

          if (namePart) {
            displayName = namePart;
          }
          if (districtPart && namePart) {
            formattedAddress = `${namePart}, ${districtPart}, Lagos`;
          } else if (namePart) {
            formattedAddress = `${namePart}, Lagos`;
          } else if (districtPart) {
            formattedAddress = `${districtPart}, Lagos`;
          }
        }
      } catch {
        // Geocode network failure falls back cleanly to coordinate/area label
      }

      const location: PickupLocation = {
        source: 'current_location',
        displayName,
        formattedAddress,
        latitude,
        longitude,
        serviceAreaLabel,
      };

      setStatus('success');
      return { success: true, location };
    } catch {
      const msg = 'Could not determine device location. Please search for an address or place.';
      setStatus('error');
      setErrorMessage(msg);
      return { success: false, reason: 'error', message: msg };
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setErrorMessage(null);
  }, []);

  return {
    errorMessage,
    requestCurrentLocation,
    reset,
    status,
  };
}
