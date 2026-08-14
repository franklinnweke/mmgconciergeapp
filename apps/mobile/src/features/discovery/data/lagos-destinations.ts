import { dateOnlySchema, type VehicleCategory } from '@mmg/contracts';

export const vehicleAreas = ['Ikoyi', 'Victoria Island', 'Lekki', 'Lagos Island'] as const;
export const areaFilters = ['All Lagos', ...vehicleAreas] as const;

export type AreaFilter = (typeof areaFilters)[number];
export type PickupDestination = {
  area: string;
  icon: 'airplane-outline' | 'business-outline' | 'globe-outline' | 'restaurant-outline' | 'water-outline';
  label: string;
  vehicleArea?: (typeof vehicleAreas)[number];
};

export const pickupDestinations: readonly PickupDestination[] = [
  { area: 'Victoria Island', icon: 'business-outline', label: 'Victoria Island', vehicleArea: 'Victoria Island' },
  { area: 'Ikoyi', icon: 'restaurant-outline', label: 'Ikoyi', vehicleArea: 'Ikoyi' },
  { area: 'Lekki', icon: 'water-outline', label: 'Lekki', vehicleArea: 'Lekki' },
  { area: 'Eko Atlantic', icon: 'globe-outline', label: 'Eko Atlantic' },
  { area: 'MMA International Airport', icon: 'airplane-outline', label: 'MMA Airport' },
];

export const journeyOptions = [
  { kind: 'offset', label: 'Today', pickupOffset: 0, returnOffset: 1 },
  { kind: 'offset', label: 'Tomorrow', pickupOffset: 1, returnOffset: 2 },
  { kind: 'weekend', label: 'Weekend' },
] as const;

export type JourneyOption = (typeof journeyOptions)[number];

export const fleetCategories: readonly { label: string; value?: VehicleCategory }[] = [
  { label: 'All fleet' },
  { label: 'Executive SUV', value: 'executive_suv' },
  { label: 'Executive sedan', value: 'executive_sedan' },
];

export function vehicleAreaForPickup(area: string): (typeof vehicleAreas)[number] | undefined {
  return pickupDestinations.find((destination) => destination.area === area)?.vehicleArea;
}

export function todayLagosDateOnly(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Africa/Lagos',
    year: 'numeric',
  }).format(now);
}

export function addDaysToDateOnly(dateOnly: string, days: number) {
  const parsed = dateOnlySchema.parse(dateOnly);
  const [year, month, day] = parsed.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

export function parseDateOnly(value?: string) {
  const parsed = dateOnlySchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function formatLagosDateOnly(dateOnly: string) {
  const parsed = dateOnlySchema.parse(dateOnly);
  return new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Lagos',
    weekday: 'short',
  }).format(new Date(`${parsed}T12:00:00+01:00`));
}

export function journeyDates(option: JourneyOption, now = new Date()) {
  const today = todayLagosDateOnly(now);
  if (option.kind === 'weekend') {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    const daysUntilSaturday = (6 - weekday + 7) % 7;
    const startDate = addDaysToDateOnly(today, daysUntilSaturday);
    return {
      endDate: addDaysToDateOnly(startDate, 2),
      startDate,
    };
  }

  return {
    endDate: addDaysToDateOnly(today, option.returnOffset),
    startDate: addDaysToDateOnly(today, option.pickupOffset),
  };
}

export function cycleJourneyOption(current: JourneyOption): JourneyOption {
  const index = journeyOptions.findIndex((option) => option.label === current.label);
  return journeyOptions[(index + 1) % journeyOptions.length];
}

export function parseJourneyLabel(value?: string): JourneyOption {
  return journeyOptions.find((option) => option.label === value) ?? journeyOptions[1];
}

export function parseFleetCategory(value?: string): VehicleCategory | undefined {
  if (value === 'executive_suv' || value === 'executive_sedan') return value;
  return undefined;
}

export function firstRouteParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}
