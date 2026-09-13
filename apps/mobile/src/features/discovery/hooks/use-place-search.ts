import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DiscoveryGateway, LAGOS_AREA_LABELS, type LagosAreaLabel } from '@mmg/contracts';

import { createDiscoveryGateway } from '../data/firestore-discovery-gateway';
import {
  CURATED_PICKUP_LOCATIONS,
  deriveLagosAreaLabel,
  searchPickupLocations,
  type PickupLocation,
} from '../domain/pickup-location';

function isValidServiceArea(label: unknown): label is LagosAreaLabel {
  return typeof label === 'string' && (LAGOS_AREA_LABELS as readonly string[]).includes(label);
}

export function generateSessionToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function resolvePickupPlaceToLocation(
  resolved: {
    placeId: string;
    displayName: string;
    formattedAddress: string;
    latitude: number;
    longitude: number;
    serviceAreaLabel: string;
  },
  note?: string,
): PickupLocation {
  const serviceArea: LagosAreaLabel | null = isValidServiceArea(resolved.serviceAreaLabel)
    ? resolved.serviceAreaLabel
    : deriveLagosAreaLabel({ lat: resolved.latitude, lng: resolved.longitude });

  if (!serviceArea) {
    throw new Error('MMG currently serves pickups within Lagos. Choose a Lagos pickup location instead.');
  }

  return {
    source: 'place_search',
    placeId: resolved.placeId,
    displayName: resolved.displayName,
    formattedAddress: resolved.formattedAddress,
    latitude: resolved.latitude,
    longitude: resolved.longitude,
    serviceAreaLabel: serviceArea,
    ...(note ? { note } : {}),
  };
}

export interface PlaceSuggestion {
  placeId: string;
  primaryText: string;
  secondaryText?: string;
  fullText: string;
  displayName: string;
  formattedAddress: string;
  isCurated?: boolean;
  location?: PickupLocation;
}

export function usePlaceSearch(query: string, customGateway?: DiscoveryGateway) {
  const trimmed = query.trim();
  const [remoteSuggestions, setRemoteSuggestions] = useState<readonly PlaceSuggestion[]>([]);
  const [remoteQuery, setRemoteQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const gatewayRef = useRef(customGateway ?? createDiscoveryGateway());
  const sessionTokenRef = useRef(generateSessionToken());

  // 1. Immediate local matching against curated landmarks
  const localMatches = useMemo(() => {
    if (!trimmed) {
      return CURATED_PICKUP_LOCATIONS;
    }
    return searchPickupLocations(trimmed);
  }, [trimmed]);

  // 2. Debounced provider search using searchPickupPlaces with session token
  useEffect(() => {
    if (trimmed.length < 2) {
      return;
    }

    let isMounted = true;
    const gateway = gatewayRef.current;

    const timer = setTimeout(async () => {
      if (!gateway.searchPickupPlaces) return;
      setIsLoading(true);
      setError(null);

      try {
        const response = await gateway.searchPickupPlaces({
          query: trimmed,
          sessionToken: sessionTokenRef.current,
        });

        if (!isMounted) return;

        const mapped: PlaceSuggestion[] = response.suggestions.map((s) => ({
          placeId: s.placeId,
          primaryText: s.primaryText,
          secondaryText: s.secondaryText,
          fullText: s.secondaryText ? `${s.primaryText}, ${s.secondaryText}` : s.primaryText,
          displayName: s.primaryText,
          formattedAddress: s.secondaryText ?? s.primaryText,
          isCurated: false,
        }));

        setRemoteSuggestions(mapped);
        setRemoteQuery(trimmed);
      } catch {
        if (!isMounted) return;
        setRemoteSuggestions([]);
        setRemoteQuery(trimmed);
        setError('Location not found in Lagos service area.');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }, 300);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [trimmed]);

  const activeRemote = useMemo(() => {
    if (trimmed.length < 2) return [];
    return remoteQuery === trimmed ? remoteSuggestions : [];
  }, [trimmed, remoteQuery, remoteSuggestions]);

  // Combined suggestions: Curated + Remote (deduplicated)
  const suggestions: readonly PlaceSuggestion[] = useMemo(() => {
    const curatedMapped: PlaceSuggestion[] = localMatches.map((loc) => ({
      placeId: loc.placeId ?? loc.formattedAddress,
      primaryText: loc.displayName,
      secondaryText: loc.formattedAddress,
      fullText: `${loc.displayName}, ${loc.formattedAddress}`,
      displayName: loc.displayName,
      formattedAddress: loc.formattedAddress,
      isCurated: true,
      location: loc,
    }));

    if (!trimmed) {
      return curatedMapped;
    }

    if (activeRemote.length === 0) {
      return curatedMapped;
    }

    const combined = [...curatedMapped];
    for (const remote of activeRemote) {
      const alreadyPresent = combined.some(
        (c) =>
          c.placeId === remote.placeId ||
          c.primaryText.toLowerCase() === remote.primaryText.toLowerCase(),
      );
      if (!alreadyPresent) {
        combined.push(remote);
      }
    }
    return combined;
  }, [trimmed, localMatches, activeRemote]);

  const displayError = useMemo(() => {
    if (!trimmed || trimmed.length < 2) return null;
    if (suggestions.length > 0) return null;
    return error;
  }, [trimmed, suggestions.length, error]);

  // 3. Resolve place details (with session token cycle)
  const resolvePlace = useCallback(
    async (suggestion: PlaceSuggestion): Promise<PickupLocation> => {
      if (suggestion.isCurated && suggestion.location) {
        sessionTokenRef.current = generateSessionToken();
        return suggestion.location;
      }

      const gateway = gatewayRef.current;
      const sessionToken = sessionTokenRef.current;

      if (!gateway.resolvePickupPlace) {
        throw new Error('Pickup location resolution is unavailable.');
      }

      try {
        const resolved = await gateway.resolvePickupPlace({
          placeId: suggestion.placeId,
          sessionToken,
        });

        return resolvePickupPlaceToLocation(resolved);
      } finally {
        sessionTokenRef.current = generateSessionToken();
      }
    },
    [],
  );

  return {
    error: displayError,
    isLoading: trimmed.length >= 2 ? isLoading : false,
    suggestions,
    results: suggestions,
    resolvePlace,
  };
}

