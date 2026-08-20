import {
  getVehicleCalendarCommandSchema,
  type GetVehicleCalendarData,
  type GetVehicleCalendarResult,
} from '@mmg/contracts';

export interface VehicleCalendarGateway {
  getCalendar(data: GetVehicleCalendarData): Promise<GetVehicleCalendarResult>;
}

export function buildGetVehicleCalendarCommand(data: GetVehicleCalendarData) {
  return getVehicleCalendarCommandSchema.parse({ schemaVersion: 1, data });
}

export function vehicleCalendarErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';
  if (code.includes('network') || code === 'unavailable') {
    return 'Availability could not be checked. Check your connection and try again.';
  }
  return 'Availability could not be checked. Try again before reviewing the quote.';
}
