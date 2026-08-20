import {
  getVehicleCalendarResultSchema,
  type GetVehicleCalendarData,
  type GetVehicleCalendarResult,
} from '@mmg/contracts';
import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';

import { parseCallableResult } from '../../../core/firebase/parse-callable-result';

import {
  buildGetVehicleCalendarCommand,
  type VehicleCalendarGateway,
} from './vehicle-calendar-gateway-core';

export type { VehicleCalendarGateway } from './vehicle-calendar-gateway-core';

export class WebVehicleCalendarGateway implements VehicleCalendarGateway {
  constructor(private readonly customFunctions?: Functions) {}

  private get functions() {
    return this.customFunctions ?? getFunctions(undefined, 'africa-south1');
  }

  async getCalendar(data: GetVehicleCalendarData): Promise<GetVehicleCalendarResult> {
    if (process.env.NODE_ENV !== 'production' && !this.customFunctions) {
      const privateBlockedDates = new Set([
        addDays(data.windowStartDate, 4),
        addDays(data.windowStartDate, 5),
      ]);
      return getVehicleCalendarResultSchema.parse({
        vehicleId: data.vehicleId,
        windowStartDate: data.windowStartDate,
        windowEndDate: data.windowEndDate,
        days: enumerateDates(data.windowStartDate, data.windowEndDate).map((date) => ({
          date,
          available: !privateBlockedDates.has(date),
        })),
      });
    }
    const callable = httpsCallable(this.functions, 'getVehicleCalendar');
    const response = await callable(buildGetVehicleCalendarCommand(data));
    return parseCallableResult(
      getVehicleCalendarResultSchema,
      response.data,
      'getVehicleCalendar',
    );
  }
}

function addDays(date: string, count: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}

function enumerateDates(startDate: string, endDate: string) {
  const dates: string[] = [];
  for (let date = startDate; date < endDate; date = addDays(date, 1)) dates.push(date);
  return dates;
}

export function createVehicleCalendarGateway(): VehicleCalendarGateway {
  return new WebVehicleCalendarGateway();
}
