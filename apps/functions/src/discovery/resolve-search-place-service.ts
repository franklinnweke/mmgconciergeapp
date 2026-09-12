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

const NON_LAGOS_LOCATIONS = [
  'abuja', 'fct', 'ibadan', 'oyo', 'port harcourt', 'rivers', 'enugu', 'kano',
  'calabar', 'asaba', 'delta', 'warri', 'benin', 'edo', 'kaduna', 'owerri',
  'imo', 'jos', 'plateau', 'maiduguri', 'ilorin', 'kwara', 'abeokuta', 'ogun',
  'akure', 'ondo', 'uyo', 'akwa ibom', 'yenagoa', 'bayelsa', 'sokoto',
  'accra', 'ghana', 'london', 'uk', 'dubai', 'uae', 'new york', 'usa', 'toronto', 'canada',
];

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type ScoredCandidate = {
  key: string;
  place: (typeof KNOWN_LAGOS_PLACES)[string];
  score: number;
};

export function resolveSearchPlaceService(input: ResolveSearchPlaceInput): ResolvedSearchPlace {
  const q = input.query.trim().toLowerCase();
  if (!q) {
    throw new CommandError('INVALID_ARGUMENT', 'Search query cannot be empty.');
  }

  // 1. Explicit out-of-area check: Fail closed if query specifies a non-Lagos region/city
  const nonLagosMatch = NON_LAGOS_LOCATIONS.find((loc) => new RegExp(`\\b${escapeRegex(loc)}\\b`, 'i').test(q));
  if (nonLagosMatch) {
    throw new CommandError(
      'NOT_FOUND',
      `Location '${input.query.trim()}' is outside the MMG Lagos service area.`,
    );
  }

  // 2. Scored matching against known Lagos landmarks
  const candidates: ScoredCandidate[] = [];

  for (const [key, place] of Object.entries(KNOWN_LAGOS_PLACES)) {
    const placeNameLower = place.displayName.toLowerCase();
    let score = 0;

    if (q === key) {
      // Exact match on dictionary key (highest priority)
      score = 1000 + key.length;
    } else if (q === placeNameLower) {
      // Exact match on full display name
      score = 900 + key.length;
    } else if (new RegExp(`\\b${escapeRegex(key)}\\b`, 'i').test(q)) {
      // Query contains the key as a discrete phrase/word (e.g. "lekki phase 1 gate" contains "lekki phase 1")
      score = 500 + key.length;
    } else if (new RegExp(`\\b${escapeRegex(q)}\\b`, 'i').test(placeNameLower)) {
      // Landmark display name contains query as discrete word (e.g. "radisson" in "Radisson Blu Anchorage...")
      score = 400 + key.length;
    } else if (key.startsWith(q) || placeNameLower.startsWith(q)) {
      // Key or display name starts with query
      score = 300 + key.length;
    } else if (placeNameLower.includes(q)) {
      // Substring match in display name
      score = 200 + key.length;
    } else if (key.length >= 4 && q.includes(key)) {
      // Query contains key as substring (min 4 chars to prevent false positives)
      score = 100 + key.length;
    }

    if (score > 0) {
      candidates.push({ key, place, score });
    }
  }

  if (candidates.length === 0) {
    throw new CommandError('NOT_FOUND', 'Could not resolve a Lagos landmark for this search query.');
  }

  // Sort candidates by score descending. For tiebreaks, prefer longer key match.
  candidates.sort((a, b) => b.score - a.score || b.key.length - a.key.length);
  const best = candidates[0]!;

  return {
    placeId: `place-lagos-${best.key.replace(/\s+/g, '-')}`,
    areaLabel: best.place.areaLabel,
    displayName: best.place.displayName,
    approxLatitude: best.place.lat,
    approxLongitude: best.place.lng,
    withinLagos: isWithinLagosBBox(best.place.lat, best.place.lng),
  };
}
