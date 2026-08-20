import type { OwnerVehicleCalendarDay } from '@mmg/contracts';

import { addDaysToDateOnly } from '../../discovery/data/lagos-destinations';

export type AvailabilitySelection = {
  startDate: string | null;
  endDate: string | null;
};

export type AvailabilitySelectionResult = {
  selection: AvailabilitySelection;
  error: string | null;
};

export function selectOwnerAvailabilityDate(
  current: AvailabilitySelection,
  selectedDate: string,
  days: readonly OwnerVehicleCalendarDay[],
): AvailabilitySelectionResult {
  const selectedDay = days.find((day) => day.date === selectedDate);
  if (!selectedDay || selectedDay.status !== 'available') {
    return {
      selection: current,
      error: 'Choose a date that is currently available.',
    };
  }

  if (!current.startDate || current.endDate || selectedDate < current.startDate) {
    return {
      selection: { startDate: selectedDate, endDate: null },
      error: null,
    };
  }

  const exclusiveEndDate = addDaysToDateOnly(selectedDate, 1);
  const blockedInsideRange = days.some((day) =>
    day.date >= current.startDate! &&
    day.date < exclusiveEndDate &&
    day.status !== 'available');
  if (blockedInsideRange) {
    return {
      selection: current,
      error: 'That range includes dates already reserved or blocked.',
    };
  }

  return {
    selection: { startDate: current.startDate, endDate: exclusiveEndDate },
    error: null,
  };
}

export function isDateInSelection(date: string, selection: AvailabilitySelection): boolean {
  if (!selection.startDate) return false;
  if (!selection.endDate) return date === selection.startDate;
  return date >= selection.startDate && date < selection.endDate;
}
