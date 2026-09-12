import { useEffect, useMemo, useRef, useState } from 'react';
import { LAGOS_AREA_LABELS, type LagosAreaLabel } from '@mmg/contracts';

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

interface RemoteSearchResult {
  query: string;
  results: readonly PickupLocation[];
  error: string | null;
}

export function usePlaceSearch(query: string) {
  const trimmed = query.trim();
  const [remoteResult, setRemoteResult] = useState<RemoteSearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const gatewayRef = useRef(createDiscoveryGateway());

  // 1. Immediate local matching against curated landmarks
  const localMatches = useMemo(() => {
    if (!trimmed) {
      return CURATED_PICKUP_LOCATIONS;
    }
    return searchPickupLocations(trimmed);
  }, [trimmed]);

  useEffect(() => {
    if (trimmed.length < 3) {
      return;
    }

    let isMounted = true;
    const gateway = gatewayRef.current;

    const timer = setTimeout(async () => {
      if (!gateway.resolveSearchPlace) return;
      setIsLoading(true);
      try {
        const place = await gateway.resolveSearchPlace(trimmed);
        if (!isMounted) return;

        const serviceArea: LagosAreaLabel =
          (isValidServiceArea(place.areaLabel)
            ? place.areaLabel
            : deriveLagosAreaLabel({ lat: place.approxLatitude, lng: place.approxLongitude })) ??
          'Victoria Island';

        const remoteLocation: PickupLocation = {
          source: 'place_search',
          placeId: place.placeId,
          displayName: place.displayName,
          formattedAddress: place.displayName.toLowerCase().includes('lagos')
            ? place.displayName
            : `${place.displayName}, Lagos`,
          latitude: place.approxLatitude,
          longitude: place.approxLongitude,
          serviceAreaLabel: serviceArea,
        };

        setRemoteResult({
          query: trimmed,
          results: [remoteLocation],
          error: null,
        });
      } catch {
        if (!isMounted) return;
        setRemoteResult({
          query: trimmed,
          results: [],
          error: 'Location not found in Lagos service area.',
        });
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }, 350);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [trimmed]);

  const activeRemote = remoteResult?.query === trimmed ? remoteResult : null;

  const results = useMemo(() => {
    if (!trimmed) {
      return CURATED_PICKUP_LOCATIONS;
    }
    if (!activeRemote || activeRemote.results.length === 0) {
      return localMatches;
    }
    const combined = [...activeRemote.results];
    for (const loc of localMatches) {
      if (
        !combined.some(
          (item) => item.placeId === loc.placeId || item.displayName === loc.displayName,
        )
      ) {
        combined.push(loc);
      }
    }
    return combined;
  }, [trimmed, localMatches, activeRemote]);

  const error = useMemo(() => {
    if (!trimmed || trimmed.length < 3) return null;
    if (localMatches.length > 0) return null;
    return activeRemote?.error ?? null;
  }, [trimmed, localMatches.length, activeRemote]);

  return {
    error,
    isLoading: trimmed.length >= 3 ? isLoading : false,
    results,
  };
}

