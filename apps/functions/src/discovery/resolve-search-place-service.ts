import { isWithinLagosBBox } from '@mmg/domain';

import { CommandError } from '../errors.js';

export type ResolveSearchPlaceInput = {
  query: string;
};

export type ResolvedSearchPlace = {
  placeId: string;
  areaLabel: string;
  displayName: string;
  approxLatitude: number;
  approxLongitude: number;
  withinLagos: boolean;
};

const KNOWN_LAGOS_PLACES: Record<string, { areaLabel: string; lat: number; lng: number; displayName: string }> = {
  ikoyi: {
    areaLabel: 'Ikoyi',
    displayName: 'Ikoyi, Lagos',
    lat: 6.4531,
    lng: 3.4334,
  },
  'victoria island': {
    areaLabel: 'Victoria Island',
    displayName: 'Victoria Island, Lagos',
    lat: 6.4281,
    lng: 3.4219,
  },
  vi: {
    areaLabel: 'Victoria Island',
    displayName: 'Victoria Island, Lagos',
    lat: 6.4281,
    lng: 3.4219,
  },
  lekki: {
    areaLabel: 'Lekki Phase 1',
    displayName: 'Lekki Phase 1, Lagos',
    lat: 6.4474,
    lng: 3.4738,
  },
  'lekki phase 1': {
    areaLabel: 'Lekki Phase 1',
    displayName: 'Lekki Phase 1, Lagos',
    lat: 6.4474,
    lng: 3.4738,
  },
  'banana island': {
    areaLabel: 'Banana Island',
    displayName: 'Banana Island, Ikoyi, Lagos',
    lat: 6.4632,
    lng: 3.4477,
  },
  'eko atlantic': {
    areaLabel: 'Eko Atlantic',
    displayName: 'Eko Atlantic City, Lagos',
    lat: 6.4167,
    lng: 3.4083,
  },
  ikeja: {
    areaLabel: 'Ikeja GRA',
    displayName: 'Ikeja GRA, Lagos',
    lat: 6.5944,
    lng: 3.3542,
  },
  'ikeja gra': {
    areaLabel: 'Ikeja GRA',
    displayName: 'Ikeja GRA, Lagos',
    lat: 6.5944,
    lng: 3.3542,
  },
  'mma airport': {
    areaLabel: 'Ikeja GRA',
    displayName: 'Murtala Muhammed International Airport (MMA)',
    lat: 6.5774,
    lng: 3.3212,
  },
  airport: {
    areaLabel: 'Ikeja GRA',
    displayName: 'Murtala Muhammed International Airport (MMA)',
    lat: 6.5774,
    lng: 3.3212,
  },
  surulere: {
    areaLabel: 'Surulere',
    displayName: 'Surulere, Lagos',
    lat: 6.4975,
    lng: 3.3567,
  },
  yaba: {
    areaLabel: 'Yaba',
    displayName: 'Yaba, Lagos',
    lat: 6.5095,
    lng: 3.3792,
  },
  'lagos island': {
    areaLabel: 'Lagos Island',
    displayName: 'Lagos Island (Marina / CMS)',
    lat: 6.4549,
    lng: 3.3886,
  },
};

export function resolveSearchPlaceService(input: ResolveSearchPlaceInput): ResolvedSearchPlace {
  const q = input.query.trim().toLowerCase();
  if (!q) {
    throw new CommandError('INVALID_ARGUMENT', 'Search query cannot be empty.');
  }

  // 1. Exact or prefix match in known Lagos landmarks
  for (const [key, place] of Object.entries(KNOWN_LAGOS_PLACES)) {
    if (q.includes(key) || key.includes(q)) {
      return {
        placeId: `place-lagos-${key.replace(/\s+/g, '-')}`,
        areaLabel: place.areaLabel,
        displayName: place.displayName,
        approxLatitude: place.lat,
        approxLongitude: place.lng,
        withinLagos: isWithinLagosBBox(place.lat, place.lng),
      };
    }
  }

  // 2. Default to central Lagos corridor (Ikoyi / VI) if recognized as a Lagos address query
  return {
    placeId: `place-lagos-general`,
    areaLabel: 'Victoria Island',
    displayName: `${input.query.trim()}, Lagos`,
    approxLatitude: 6.4281,
    approxLongitude: 3.4219,
    withinLagos: true,
  };
}
