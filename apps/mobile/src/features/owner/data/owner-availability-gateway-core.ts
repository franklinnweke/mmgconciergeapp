import {
  getVehicleCalendarCommandSchema,
  removeVehicleAvailabilityBlockCommandSchema,
  setVehicleAvailabilityBlockCommandSchema,
  type GetOwnerVehicleCalendarResult,
  type GetVehicleCalendarData,
  type RemoveVehicleAvailabilityBlockData,
  type RemoveVehicleAvailabilityBlockResult,
  type SetVehicleAvailabilityBlockData,
  type SetVehicleAvailabilityBlockResult,
} from '@mmg/contracts';

export interface OwnerAvailabilityGateway {
  getCalendar(data: GetVehicleCalendarData): Promise<GetOwnerVehicleCalendarResult>;
  setBlock(
    data: SetVehicleAvailabilityBlockData,
    idempotencyKey: string,
  ): Promise<SetVehicleAvailabilityBlockResult>;
  removeBlock(
    data: RemoveVehicleAvailabilityBlockData,
    idempotencyKey: string,
  ): Promise<RemoveVehicleAvailabilityBlockResult>;
}

export function buildGetOwnerCalendarCommand(data: GetVehicleCalendarData) {
  return getVehicleCalendarCommandSchema.parse({ schemaVersion: 1, data });
}

export function buildSetAvailabilityBlockCommand(
  data: SetVehicleAvailabilityBlockData,
  idempotencyKey: string,
) {
  return setVehicleAvailabilityBlockCommandSchema.parse({
    schemaVersion: 1,
    idempotencyKey,
    data,
  });
}

export function buildRemoveAvailabilityBlockCommand(
  data: RemoveVehicleAvailabilityBlockData,
  idempotencyKey: string,
) {
  return removeVehicleAvailabilityBlockCommandSchema.parse({
    schemaVersion: 1,
    idempotencyKey,
    data,
  });
}
