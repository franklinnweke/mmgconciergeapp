import {
  getVehicleCalendarResultSchema,
  type GetVehicleCalendarData,
  type GetVehicleCalendarResult,
} from '@mmg/contracts';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';

import { parseCallableResult } from '../../../core/firebase/parse-callable-result';

import {
  buildGetVehicleCalendarCommand,
  type VehicleCalendarGateway,
} from './vehicle-calendar-gateway-core';

export type { VehicleCalendarGateway } from './vehicle-calendar-gateway-core';

export class NativeVehicleCalendarGateway implements VehicleCalendarGateway {
  private get functions() {
    return getFunctions(undefined, 'africa-south1');
  }

  async getCalendar(data: GetVehicleCalendarData): Promise<GetVehicleCalendarResult> {
    const callable = httpsCallable(this.functions, 'getVehicleCalendar');
    const response = await callable(buildGetVehicleCalendarCommand(data));
    return parseCallableResult(
      getVehicleCalendarResultSchema,
      response.data,
      'getVehicleCalendar',
    );
  }
}

export function createVehicleCalendarGateway(): VehicleCalendarGateway {
  return new NativeVehicleCalendarGateway();
}
