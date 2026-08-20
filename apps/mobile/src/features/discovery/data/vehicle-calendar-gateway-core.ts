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
