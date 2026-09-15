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
      const { status: existingStatus } = await Location.getForegroundPermissionsAsync();
      let finalStatus = existingStatus;

      if (finalStatus !== Location.PermissionStatus.GRANTED) {
        const { status: requestedStatus } = await Location.requestForegroundPermissionsAsync();
        finalStatus = requestedStatus;
      }

      if (finalStatus !== Location.PermissionStatus.GRANTED) {
        const msg = 'Location access is unavailable. Search for your pickup instead.';
        setStatus('denied');
        setErrorMessage(msg);
        return { success: false, reason: 'denied', message: msg };
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude, longitude } = position.coords;

      if (!isWithinLagosBBox(latitude, longitude)) {
        const msg = 'Your current location is outside our Lagos service area. Search for a Lagos pickup location instead.';
        setStatus('outside_lagos');
        setErrorMessage(msg);
        return { success: false, reason: 'outside_lagos', message: msg };
      }

      const serviceAreaLabel = deriveLagosAreaLabel({ lat: latitude, lng: longitude });
      if (!serviceAreaLabel) {
        const msg = 'This location is outside our Lagos service area. Search for a Lagos pickup location instead.';
        setStatus('outside_lagos');
        setErrorMessage(msg);
        return { success: false, reason: 'outside_lagos', message: msg };
      }

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
        // Geocode network failure falls back cleanly to coordinate/area label.
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
