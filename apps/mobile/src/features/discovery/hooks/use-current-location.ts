import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { isWithinLagosBBox } from '@mmg/domain';
import { acquirePickupFix, PICKUP_PRECISE_ACCURACY_METERS } from '../data/pickup-device-location';

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
  const [accuracyMessage, setAccuracyMessage] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); }, []);

  const requestCurrentLocation = useCallback(async (): Promise<CurrentLocationResult> => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setStatus('requesting');
    setErrorMessage(null);
    setAccuracyMessage(null);

    try {
      const { status: existingStatus } = await Location.getForegroundPermissionsAsync();
      if (controller.signal.aborted) throw new Error('Cancelled');
      let finalStatus = existingStatus;

      if (finalStatus !== Location.PermissionStatus.GRANTED) {
        const { status: requestedStatus } = await Location.requestForegroundPermissionsAsync();
        if (controller.signal.aborted) throw new Error('Cancelled');
        finalStatus = requestedStatus;
      }

      if (finalStatus !== Location.PermissionStatus.GRANTED) {
        const msg = 'Location access is unavailable. Search for your pickup instead.';
        setStatus('denied');
        setErrorMessage(msg);
        return { success: false, reason: 'denied', message: msg };
      }

      if (!await Location.hasServicesEnabledAsync()) throw new Error('Location services unavailable');
      const position = await acquirePickupFix(controller.signal);

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
        let timer: ReturnType<typeof setTimeout> | undefined;
        const geocoded = await Promise.race([
          Location.reverseGeocodeAsync({ latitude, longitude }),
          new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Geocoding timeout')), 3_000); }),
        ]).finally(() => { if (timer) clearTimeout(timer); });
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

      if (controller.signal.aborted) throw new Error('Cancelled');
      if (position.coords.accuracy! > PICKUP_PRECISE_ACCURACY_METERS) {
        setAccuracyMessage('Your location is approximate. Adjust the pin and confirm your pickup.');
      }
      setStatus('success');
      return { success: true, location };
    } catch {
      if (controller.signal.aborted) return { success: false, reason: 'error', message: 'Location request cancelled.' };
      const msg = 'Could not determine device location. Please search for an address or place.';
      setStatus('error');
      setErrorMessage(msg);
      return { success: false, reason: 'error', message: msg };
    }
  }, []);

  const reset = useCallback(() => {
    active.current?.abort();
    setStatus('idle');
    setErrorMessage(null);
    setAccuracyMessage(null);
  }, []);

  return {
    accuracyMessage,
    errorMessage,
    requestCurrentLocation,
    reset,
    status,
  };
}
