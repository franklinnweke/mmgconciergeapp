import { calculateChargedDays } from '@mmg/domain';
import { addDaysToDateOnly, parseDateOnly, todayLagosDateOnly } from './lagos-destinations';

export function adjustRentalDuration(days: number, change: -1 | 1): number {
  return Math.max(1, Math.min(30, days + change));
}

// Shared by vehicle detail and booking review so route dates are not reinterpreted
// as a preset duration between discovery and the server-priced hold.
export function resolveRentalJourney(startDate?: string, endDate?: string) {
  const start = parseDateOnly(startDate) ?? todayLagosDateOnly();
  try {
    const end = parseDateOnly(endDate) ?? addDaysToDateOnly(start, 1);
    return { durationDays: calculateChargedDays(start, end), endDate: end, startDate: start };
  } catch {
    return { durationDays: 1, endDate: addDaysToDateOnly(start, 1), startDate: start };
  }
}

export type Availability = { error: string | null; status: 'loading' | 'available' | 'unavailable' | 'error' };
export function currentAvailability(
  result: { key: string; value: Availability } | null,
  key: string,
): Availability {
  return result?.key === key ? result.value : { error: null, status: 'loading' };
}
