import { isWithinLagosBBox } from '@mmg/domain';
import { LAGOS_AREA_LABELS, type LagosAreaLabel } from '@mmg/contracts';

export type PickupLocation = {
  displayName: string;
  formattedAddress: string;
  serviceAreaLabel: LagosAreaLabel;
  placeId?: string;
  latitude?: number;
  longitude?: number;
};

export const CURATED_PICKUP_LOCATIONS: readonly PickupLocation[] = [
  {
    placeId: 'loc-mma-airport',
    displayName: 'Murtala Muhammed Airport (LOS)',
    formattedAddress: 'International Terminal, Ikeja, Lagos',
    serviceAreaLabel: 'Ikeja',
    latitude: 6.5774,
    longitude: 3.3212,
  },
  {
    placeId: 'loc-mma-execujet',
    displayName: 'ExecuJet Private Terminal',
    formattedAddress: 'Private Jet Terminal, Ikeja, Lagos',
    serviceAreaLabel: 'Ikeja',
    latitude: 6.582,
    longitude: 3.325,
  },
  {
    placeId: 'loc-eko-hotel',
    displayName: 'Eko Hotel & Suites',
    formattedAddress: 'Plot 1415 Adetokunbo Ademola St, Victoria Island, Lagos',
    serviceAreaLabel: 'Victoria Island',
    latitude: 6.4269,
    longitude: 3.4285,
  },
  {
    placeId: 'loc-wheatbaker',
    displayName: 'The Wheatbaker',
    formattedAddress: '4 Onitolo Rd, Ikoyi, Lagos',
    serviceAreaLabel: 'Ikoyi',
    latitude: 6.4485,
    longitude: 3.4385,
  },
  {
    placeId: 'loc-banana-island',
    displayName: 'Banana Island Gate',
    formattedAddress: 'Banana Island, Ikoyi, Lagos',
    serviceAreaLabel: 'Banana Island',
    latitude: 6.4632,
    longitude: 3.4477,
  },
  {
    placeId: 'loc-civic-centre',
    displayName: 'The Civic Centre',
    formattedAddress: 'Ozumba Mbadiwe Ave, Victoria Island, Lagos',
    serviceAreaLabel: 'Victoria Island',
    latitude: 6.438,
    longitude: 3.427,
  },
  {
    placeId: 'loc-lekki-admiralty',
    displayName: 'Lekki Phase 1 (Admiralty Way)',
    formattedAddress: 'Admiralty Way, Lekki Phase 1, Lagos',
    serviceAreaLabel: 'Lekki Phase 1',
    latitude: 6.4474,
    longitude: 3.4738,
  },
  {
    placeId: 'loc-ikeja-gra',
    displayName: 'Ikeja GRA (Isaac John)',
    formattedAddress: 'Isaac John St, Ikeja GRA, Lagos',
    serviceAreaLabel: 'Ikeja',
    latitude: 6.5944,
    longitude: 3.3542,
  },
] as const;

export const DEFAULT_PICKUP_LOCATION: PickupLocation = CURATED_PICKUP_LOCATIONS[2]; // Eko Hotel & Suites

function isValidServiceArea(label: unknown): label is LagosAreaLabel {
  return typeof label === 'string' && (LAGOS_AREA_LABELS as readonly string[]).includes(label);
}

/**
 * Maps arbitrary query text or address strings into a canonical LagosAreaLabel.
 */
export function deriveLagosAreaLabel(text: string): LagosAreaLabel {
  const lower = text.toLowerCase().trim();

  if (lower.includes('airport') || lower.includes('mma') || lower.includes('execujet')) {
    return 'Ikeja';
  }
  if (lower.includes('banana island')) {
    return 'Banana Island';
  }
  if (lower.includes('ikoyi')) {
    return 'Ikoyi';
  }
  if (lower.includes('eko atlantic') || lower.includes('victoria island') || lower.includes(' vi') || lower.startsWith('vi')) {
    return 'Victoria Island';
  }
  if (lower.includes('lekki phase 1') || lower.includes('admiralty')) {
    return 'Lekki Phase 1';
  }
  if (lower.includes('lekki')) {
    return 'Lekki';
  }
  if (lower.includes('oniru')) {
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

  return 'Victoria Island';
}

/**
 * Searches curated landmarks or creates a synthesized Lagos delivery location.
 */
export function searchPickupLocations(query: string): PickupLocation[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...CURATED_PICKUP_LOCATIONS];
  }

  // 1. Direct matches in curated landmarks
  const matched = CURATED_PICKUP_LOCATIONS.filter(
    (loc) =>
      loc.displayName.toLowerCase().includes(q) ||
      loc.formattedAddress.toLowerCase().includes(q) ||
      loc.serviceAreaLabel.toLowerCase().includes(q),
  );

  if (matched.length > 0) {
    return matched;
  }

  // 2. Synthesize a custom address if the user typed an address
  const derivedArea = deriveLagosAreaLabel(q);
  const synthesized: PickupLocation = {
    displayName: query.trim(),
    formattedAddress: `${query.trim()}, Lagos`,
    serviceAreaLabel: derivedArea,
  };

  return [synthesized];
}

/**
 * Validates whether a pickup location is serviceable (inside Lagos).
 */
export function isPickupLocationServiceable(location: PickupLocation): boolean {
  if (location.latitude != null && location.longitude != null) {
    return isWithinLagosBBox(location.latitude, location.longitude);
  }
  return isValidServiceArea(location.serviceAreaLabel);
}

/**
 * Serializes PickupLocation for URL route parameters.
 */
export function serializePickupLocation(pickup: PickupLocation): string {
  return JSON.stringify({
    d: pickup.displayName,
    f: pickup.formattedAddress,
    s: pickup.serviceAreaLabel,
    ...(pickup.placeId ? { p: pickup.placeId } : {}),
    ...(pickup.latitude != null ? { lat: pickup.latitude } : {}),
    ...(pickup.longitude != null ? { lng: pickup.longitude } : {}),
  });
}

/**
 * Parses PickupLocation from URL route parameters or fallback strings.
 */
export function parsePickupLocation(value?: string | string[] | null): PickupLocation {
  const input = Array.isArray(value) ? value[0] : value;
  if (!input) return DEFAULT_PICKUP_LOCATION;

  try {
    const raw = JSON.parse(input);
    if (raw && typeof raw === 'object') {
      const displayName = raw.d ?? raw.displayName;
      const formattedAddress = raw.f ?? raw.formattedAddress;
      const serviceAreaLabel = raw.s ?? raw.serviceAreaLabel;

      if (displayName && formattedAddress && isValidServiceArea(serviceAreaLabel)) {
        return {
          displayName: String(displayName),
          formattedAddress: String(formattedAddress),
          serviceAreaLabel,
          placeId: raw.p ?? raw.placeId,
          latitude: typeof raw.lat === 'number' ? raw.lat : raw.latitude,
          longitude: typeof raw.lng === 'number' ? raw.lng : raw.longitude,
        };
      }
    }
  } catch {
    // Not JSON, continue to string matchers
  }

  // Check against curated locations
  const curated = CURATED_PICKUP_LOCATIONS.find(
    (loc) =>
      loc.displayName.toLowerCase() === input.toLowerCase() ||
      loc.formattedAddress.toLowerCase() === input.toLowerCase() ||
      loc.placeId === input,
  );
  if (curated) return curated;

  // Fallback string resolution (e.g. "Victoria Island, Lagos" or "Ikoyi")
  const areaLabel = deriveLagosAreaLabel(input);
  return {
    displayName: input.replace(/,\s*Lagos$/i, '').trim(),
    formattedAddress: input.toLowerCase().includes('lagos') ? input.trim() : `${input.trim()}, Lagos`,
    serviceAreaLabel: areaLabel,
  };
}
