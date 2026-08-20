import {
  getOwnerVehicleCalendarResultSchema,
  removeVehicleAvailabilityBlockResultSchema,
  setVehicleAvailabilityBlockResultSchema,
  type GetOwnerVehicleCalendarResult,
  type GetVehicleCalendarData,
  type RemoveVehicleAvailabilityBlockData,
  type RemoveVehicleAvailabilityBlockResult,
  type SetVehicleAvailabilityBlockData,
  type SetVehicleAvailabilityBlockResult,
} from '@mmg/contracts';
import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';

import { parseCallableResult } from '@/core/firebase/parse-callable-result';

import {
  buildGetOwnerCalendarCommand,
  buildRemoveAvailabilityBlockCommand,
  buildSetAvailabilityBlockCommand,
  type OwnerAvailabilityGateway,
} from './owner-availability-gateway-core';

export type { OwnerAvailabilityGateway } from './owner-availability-gateway-core';

export class WebOwnerAvailabilityGateway implements OwnerAvailabilityGateway {
  constructor(private readonly customFunctions?: Functions) {}

  private get functions() {
    return this.customFunctions ?? getFunctions(undefined, 'africa-south1');
  }

  async getCalendar(data: GetVehicleCalendarData): Promise<GetOwnerVehicleCalendarResult> {
    const callable = httpsCallable(this.functions, 'getOwnerVehicleCalendar');
    const response = await callable(buildGetOwnerCalendarCommand(data));
    return parseCallableResult(
      getOwnerVehicleCalendarResultSchema,
      response.data,
      'getOwnerVehicleCalendar',
    );
  }

  async setBlock(
    data: SetVehicleAvailabilityBlockData,
    idempotencyKey: string,
  ): Promise<SetVehicleAvailabilityBlockResult> {
    const callable = httpsCallable(this.functions, 'setVehicleAvailabilityBlock');
    const response = await callable(buildSetAvailabilityBlockCommand(data, idempotencyKey));
    return parseCallableResult(
      setVehicleAvailabilityBlockResultSchema,
      response.data,
      'setVehicleAvailabilityBlock',
    );
  }

  async removeBlock(
    data: RemoveVehicleAvailabilityBlockData,
    idempotencyKey: string,
  ): Promise<RemoveVehicleAvailabilityBlockResult> {
    const callable = httpsCallable(this.functions, 'removeVehicleAvailabilityBlock');
    const response = await callable(buildRemoveAvailabilityBlockCommand(data, idempotencyKey));
    return parseCallableResult(
      removeVehicleAvailabilityBlockResultSchema,
      response.data,
      'removeVehicleAvailabilityBlock',
    );
  }
}

export function createOwnerAvailabilityGateway(): OwnerAvailabilityGateway {
  return new WebOwnerAvailabilityGateway();
}
