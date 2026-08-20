import type { RenterTrip, RenterTripGroup } from './renter-trip';

const groupPriority: Record<RenterTripGroup, number> = {
  intervention: 0,
  active: 1,
  upcoming: 2,
  past: 3,
};

export function selectHomeJourney(trips: readonly RenterTrip[]): RenterTrip | null {
  const visible = trips.filter((trip) => trip.group !== 'past');
  if (!visible.length) return null;

  return [...visible].sort((left, right) => {
    const groupDelta = groupPriority[left.group] - groupPriority[right.group];
    if (groupDelta !== 0) return groupDelta;
    return right.updatedAt.localeCompare(left.updatedAt);
  })[0] ?? null;
}

export function formatLagosClock(now = new Date()) {
  const time = new Intl.DateTimeFormat('en-NG', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Africa/Lagos',
  }).format(now);
  return `${time} WAT`;
}

export function firstNameFromDisplayName(displayName?: string | null) {
  const first = displayName?.trim().split(/\s+/)[0];
  return first || 'there';
}
