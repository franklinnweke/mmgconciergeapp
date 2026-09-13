import {
  deriveLagosAreaLabelFromCoordinates,
  isWithinLagosBBox,
  LAGOS_AREA_CENTROIDS,
} from '@mmg/domain';
import { LAGOS_AREA_LABELS, type LagosAreaLabel } from '@mmg/contracts';

export type PickupLocationSource = 'current_location' | 'place_search' | 'suggested' | 'saved' | 'pin_adjusted';

export type PickupLocation = {
  source: PickupLocationSource;
  displayName: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  placeId?: string;
  serviceAreaLabel: LagosAreaLabel;
  note?: string;
};

export { LAGOS_AREA_CENTROIDS };

export const CURATED_PICKUP_LOCATIONS: readonly PickupLocation[] = [
  {
    placeId: 'loc-mma-airport',
    displayName: 'Murtala Muhammed Airport (LOS)',
    formattedAddress: 'International Terminal, Ikeja, Lagos',
    serviceAreaLabel: 'Ikeja',
    latitude: 6.5774,
    longitude: 3.3212,
    source: 'suggested',
  },
  {
    placeId: 'loc-mma-execujet',
    displayName: 'ExecuJet Private Terminal',
    formattedAddress: 'Private Jet Terminal, Ikeja, Lagos',
    serviceAreaLabel: 'Ikeja',
    latitude: 6.582,
    longitude: 3.325,
    source: 'suggested',
  },
  {
    placeId: 'loc-eko-hotel',
    displayName: 'Eko Hotel & Suites',
    formattedAddress: 'Plot 1415 Adetokunbo Ademola St, Victoria Island, Lagos',
    serviceAreaLabel: 'Victoria Island',
    latitude: 6.4269,
    longitude: 3.4285,
    source: 'suggested',
  },
  {
    placeId: 'loc-wheatbaker',
    displayName: 'The Wheatbaker',
    formattedAddress: '4 Onitolo Rd, Ikoyi, Lagos',
    serviceAreaLabel: 'Ikoyi',
    latitude: 6.4485,
    longitude: 3.4385,
    source: 'suggested',
  },
  {
    placeId: 'loc-banana-island',
    displayName: 'Banana Island Gate',
    formattedAddress: 'Banana Island, Ikoyi, Lagos',
    serviceAreaLabel: 'Banana Island',
    latitude: 6.4632,
    longitude: 3.4477,
    source: 'suggested',
  },
  {
    placeId: 'loc-civic-centre',
    displayName: 'The Civic Centre',
    formattedAddress: 'Ozumba Mbadiwe Ave, Victoria Island, Lagos',
    serviceAreaLabel: 'Victoria Island',
    latitude: 6.438,
    longitude: 3.427,
    source: 'suggested',
  },
  {
    placeId: 'loc-lekki-admiralty',
    displayName: 'Lekki Phase 1 (Admiralty Way)',
    formattedAddress: 'Admiralty Way, Lekki Phase 1, Lagos',
    serviceAreaLabel: 'Lekki Phase 1',
    latitude: 6.4474,
    longitude: 3.4738,
    source: 'suggested',
  },
  {
    placeId: 'loc-ikeja-gra',
    displayName: 'Ikeja GRA (Isaac John)',
    formattedAddress: 'Isaac John St, Ikeja GRA, Lagos',
    serviceAreaLabel: 'Ikeja',
    latitude: 6.5944,
    longitude: 3.3542,
    source: 'suggested',
  },
] as const;

function isValidServiceArea(label: unknown): label is LagosAreaLabel {
  return typeof label === 'string' && (LAGOS_AREA_LABELS as readonly string[]).includes(label);
}

/**
 * Derives a canonical LagosAreaLabel from either coordinates or text input.
 * Returns null if the location cannot be truthfully mapped inside Lagos.
 */
export function deriveLagosAreaLabel(
  input: string | { lat: number; lng: number },
): LagosAreaLabel | null {
  if (typeof input === 'object' && input !== null) {
    return deriveLagosAreaLabelFromCoordinates(input.lat, input.lng) as LagosAreaLabel | null;
  }

  const lower = String(input).toLowerCase().trim();
  if (lower.includes('airport') || lower.includes('mma') || lower.includes('execujet')) {
    return 'Ikeja';
  }
  if (lower.includes('banana island')) {
    return 'Banana Island';
  }
  if (lower.includes('ikoyi') || lower.includes('wheatbaker')) {
    return 'Ikoyi';
  }
  if (
    lower.includes('eko atlantic') ||
    lower.includes('victoria island') ||
    lower.includes('eko hotel') ||
    /\bvi\b/.test(lower)
  ) {
    return 'Victoria Island';
  }
  if (lower.includes('lekki phase 1') || lower.includes('admiralty')) {
    return 'Lekki Phase 1';
  }
  if (lower.includes('lekki')) {
    return 'Lekki';
  }
  if (lower.includes('oniru') || lower.includes('landmark')) {
    return 'Oniru';
  }
  if (lower.includes('ikeja')) {
    return 'Ikeja';
  }
  if (lower.includes('maryland')) {
    return 'Maryland';
  }
  if (lower.includes('ajah')) {
    return 'Ajah';
  }
  if (lower.includes('yaba')) {
    return 'Yaba';
  }
  if (lower.includes('surulere')) {
    return 'Surulere';
  }
  if (lower.includes('lagos island') || lower.includes('marina') || lower.includes('cms')) {
    return 'Lagos Island';
  }

  // Fails closed: Never assume Victoria Island
  return null;
}

/**
 * Searches curated landmarks.
 * Fails closed without synthesizing fake address records.
 */
export function searchPickupLocations(query: string): PickupLocation[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...CURATED_PICKUP_LOCATIONS];
  }

  return CURATED_PICKUP_LOCATIONS.filter(
    (loc) =>
      loc.displayName.toLowerCase().includes(q) ||
      loc.formattedAddress.toLowerCase().includes(q) ||
      loc.serviceAreaLabel.toLowerCase().includes(q),
  );
}

/**
 * Validates whether a pickup location is serviceable (strictly inside Lagos bounding box).
 */
export function isPickupLocationServiceable(location: PickupLocation): boolean {
  if (typeof location?.latitude !== 'number' || typeof location?.longitude !== 'number') {
    return false;
  }
  return isWithinLagosBBox(location.latitude, location.longitude);
}

/**
 * Serializes PickupLocation for URL route parameters.
 */
export function serializePickupLocation(pickup: PickupLocation): string {
  return JSON.stringify({
    src: pickup.source,
    d: pickup.displayName,
    f: pickup.formattedAddress,
    s: pickup.serviceAreaLabel,
    lat: pickup.latitude,
    lng: pickup.longitude,
    ...(pickup.placeId ? { p: pickup.placeId } : {}),
    ...(pickup.note ? { n: pickup.note } : {}),
  });
}

/**
 * Parses PickupLocation from URL route parameters or fallback strings.
 * Fails closed and returns null on missing, invalid, or out-of-Lagos input.
 */
export function parsePickupLocation(value?: string | string[] | null): PickupLocation | null {
  const input = Array.isArray(value) ? value[0] : value;
  if (!input) return null;

  try {
    const raw = JSON.parse(input);
    if (raw && typeof raw === 'object') {
      const displayName = raw.d ?? raw.displayName;
      const formattedAddress = raw.f ?? raw.formattedAddress;
      const serviceAreaLabel = raw.s ?? raw.serviceAreaLabel;
      const latitude = typeof raw.lat === 'number' ? raw.lat : raw.latitude;
      const longitude = typeof raw.lng === 'number' ? raw.lng : raw.longitude;
      const source: PickupLocationSource = raw.src ?? raw.source ?? 'place_search';
      const note = raw.n ?? raw.note;

      if (
        displayName &&
        formattedAddress &&
        typeof latitude === 'number' &&
        typeof longitude === 'number' &&
        isWithinLagosBBox(latitude, longitude) &&
        isValidServiceArea(serviceAreaLabel)
      ) {
        return {
          source,
          displayName: String(displayName),
          formattedAddress: String(formattedAddress),
          serviceAreaLabel,
          latitude,
          longitude,
          placeId: raw.p ?? raw.placeId,
          ...(note ? { note: String(note) } : {}),
        };
      }
    }
  } catch {
    // Not JSON, check curated landmarks
  }

  // Check against curated locations
  const curated = CURATED_PICKUP_LOCATIONS.find(
    (loc) =>
      loc.displayName.toLowerCase() === input.toLowerCase() ||
      loc.formattedAddress.toLowerCase() === input.toLowerCase() ||
      loc.placeId === input,
  );
  if (curated) return curated;

  // Fail closed
  return null;
}
