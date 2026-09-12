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
  'eko hotel': {
    areaLabel: 'Victoria Island',
    displayName: 'Eko Hotel & Suites, Victoria Island, Lagos',
    lat: 6.4269,
    lng: 3.4285,
  },
  wheatbaker: {
    areaLabel: 'Ikoyi',
    displayName: 'The Wheatbaker, Ikoyi, Lagos',
    lat: 6.4485,
    lng: 3.4385,
  },
  'the wheatbaker': {
    areaLabel: 'Ikoyi',
    displayName: 'The Wheatbaker, Ikoyi, Lagos',
    lat: 6.4485,
    lng: 3.4385,
  },
  'civic centre': {
    areaLabel: 'Victoria Island',
    displayName: 'The Civic Centre, Victoria Island, Lagos',
    lat: 6.438,
    lng: 3.427,
  },
  'the civic centre': {
    areaLabel: 'Victoria Island',
    displayName: 'The Civic Centre, Victoria Island, Lagos',
    lat: 6.438,
    lng: 3.427,
  },
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
    areaLabel: 'Lekki',
    displayName: 'Lekki, Lagos',
    lat: 6.4698,
    lng: 3.5852,
  },
  'lekki phase 1': {
    areaLabel: 'Lekki Phase 1',
    displayName: 'Lekki Phase 1, Lagos',
    lat: 6.4474,
    lng: 3.4738,
  },
  'admiralty way': {
    areaLabel: 'Lekki Phase 1',
    displayName: 'Admiralty Way, Lekki Phase 1, Lagos',
    lat: 6.4474,
    lng: 3.4738,
  },
  admiralty: {
    areaLabel: 'Lekki Phase 1',
    displayName: 'Admiralty Way, Lekki Phase 1, Lagos',
    lat: 6.4474,
    lng: 3.4738,
  },
  'banana island': {
    areaLabel: 'Banana Island',
    displayName: 'Banana Island, Ikoyi, Lagos',
    lat: 6.4632,
    lng: 3.4477,
  },
  oniru: {
    areaLabel: 'Oniru',
    displayName: 'Oniru, Victoria Island, Lagos',
    lat: 6.4342,
    lng: 3.4435,
  },
  landmark: {
    areaLabel: 'Oniru',
    displayName: 'Landmark Centre, Oniru, Lagos',
    lat: 6.4248,
    lng: 3.4449,
  },
  'eko atlantic': {
    areaLabel: 'Victoria Island',
    displayName: 'Eko Atlantic City, Lagos',
    lat: 6.4167,
    lng: 3.4083,
  },
  'eko pearl': {
    areaLabel: 'Victoria Island',
    displayName: 'Eko Pearl Towers, Eko Atlantic, Lagos',
    lat: 6.4167,
    lng: 3.4083,
  },
  ikeja: {
    areaLabel: 'Ikeja',
    displayName: 'Ikeja GRA, Lagos',
    lat: 6.5944,
    lng: 3.3542,
  },
  'ikeja gra': {
    areaLabel: 'Ikeja',
    displayName: 'Ikeja GRA, Lagos',
    lat: 6.5944,
    lng: 3.3542,
  },
  'isaac john': {
    areaLabel: 'Ikeja',
    displayName: 'Isaac John St, Ikeja GRA, Lagos',
    lat: 6.5944,
    lng: 3.3542,
  },
  'mma airport': {
    areaLabel: 'Ikeja',
    displayName: 'Murtala Muhammed International Airport (MMA)',
    lat: 6.5774,
    lng: 3.3212,
  },
  mmia: {
    areaLabel: 'Ikeja',
    displayName: 'Murtala Muhammed International Airport (MMIA)',
    lat: 6.5774,
    lng: 3.3212,
  },
  airport: {
    areaLabel: 'Ikeja',
    displayName: 'Murtala Muhammed International Airport (MMA)',
    lat: 6.5774,
    lng: 3.3212,
  },
  execujet: {
    areaLabel: 'Ikeja',
    displayName: 'ExecuJet Private Terminal, Ikeja, Lagos',
    lat: 6.582,
    lng: 3.325,
  },
  maryland: {
    areaLabel: 'Maryland',
    displayName: 'Maryland, Lagos',
    lat: 6.5721,
    lng: 3.3667,
  },
  'maryland mall': {
    areaLabel: 'Maryland',
    displayName: 'Maryland Mall, Maryland, Lagos',
    lat: 6.5721,
    lng: 3.3667,
  },
  ajah: {
    areaLabel: 'Ajah',
    displayName: 'Ajah, Lagos',
    lat: 6.4674,
    lng: 3.5684,
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
  marina: {
    areaLabel: 'Lagos Island',
    displayName: 'Marina, Lagos Island, Lagos',
    lat: 6.4549,
    lng: 3.3886,
  },
};

export function resolveSearchPlaceService(input: ResolveSearchPlaceInput): ResolvedSearchPlace {
  const q = input.query.trim().toLowerCase();
  if (!q) {
    throw new CommandError('INVALID_ARGUMENT', 'Search query cannot be empty.');
  }

  // Exact or substring match in known Lagos landmarks
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

  // Fail closed: Never synthesize a fake address or default to Victoria Island
  throw new CommandError('NOT_FOUND', 'Could not resolve a Lagos location for this search query.');
}
