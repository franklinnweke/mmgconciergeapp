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
  type OwnerAvailabilityBlock,
} from '@mmg/contracts';
import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';

import { parseCallableResult } from '../../../core/firebase/parse-callable-result';

import {
  buildGetOwnerCalendarCommand,
  buildRemoveAvailabilityBlockCommand,
  buildSetAvailabilityBlockCommand,
  type OwnerAvailabilityGateway,
} from './owner-availability-gateway-core';

export type { OwnerAvailabilityGateway } from './owner-availability-gateway-core';

export class WebOwnerAvailabilityGateway implements OwnerAvailabilityGateway {
  private availabilityVersion = 0;
  private previewBlocks: OwnerAvailabilityBlock[] = [];
  private previewReservedDates = new Set<string>();

  constructor(private readonly customFunctions?: Functions) {}

  private get functions() {
    return this.customFunctions ?? getFunctions(undefined, 'africa-south1');
  }

  async getCalendar(data: GetVehicleCalendarData): Promise<GetOwnerVehicleCalendarResult> {
    if (process.env.NODE_ENV !== 'production' && !this.customFunctions) {
      return this.getPreviewCalendar(data);
    }
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
    if (process.env.NODE_ENV !== 'production' && !this.customFunctions) {
      if (data.expectedAvailabilityVersion !== this.availabilityVersion) {
        throw new Error('Vehicle calendar changed. Refresh and retry.');
      }
      const now = new Date().toISOString();
      const block: OwnerAvailabilityBlock = {
        blockId: `preview-block-${this.availabilityVersion + 1}`,
        vehicleId: data.vehicleId,
        startDate: data.startDate,
        endDate: data.endDate,
        reason: data.reason,
        notes: data.notes ?? null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      this.previewBlocks.push(block);
      this.availabilityVersion += 1;
      return setVehicleAvailabilityBlockResultSchema.parse({
        requestId: idempotencyKey,
        result: { block, availabilityVersion: this.availabilityVersion },
      });
    }
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
    if (process.env.NODE_ENV !== 'production' && !this.customFunctions) {
      if (data.expectedAvailabilityVersion !== this.availabilityVersion) {
        throw new Error('Vehicle calendar changed. Refresh and retry.');
      }
      const index = this.previewBlocks.findIndex((block) =>
        block.blockId === data.blockId &&
        block.vehicleId === data.vehicleId &&
        block.version === data.expectedBlockVersion);
      if (index < 0) throw new Error('Availability block was not found.');
      this.previewBlocks.splice(index, 1);
      this.availabilityVersion += 1;
      return removeVehicleAvailabilityBlockResultSchema.parse({
        requestId: idempotencyKey,
        result: {
          vehicleId: data.vehicleId,
          blockId: data.blockId,
          removed: true,
          availabilityVersion: this.availabilityVersion,
        },
      });
    }
    const callable = httpsCallable(this.functions, 'removeVehicleAvailabilityBlock');
    const response = await callable(buildRemoveAvailabilityBlockCommand(data, idempotencyKey));
    return parseCallableResult(
      removeVehicleAvailabilityBlockResultSchema,
      response.data,
      'removeVehicleAvailabilityBlock',
    );
  }

  private getPreviewCalendar(data: GetVehicleCalendarData): GetOwnerVehicleCalendarResult {
    if (this.previewBlocks.length === 0 && this.availabilityVersion === 0) {
      const createdAt = new Date().toISOString();
      this.previewBlocks = [{
        blockId: 'preview-owner-block',
        vehicleId: data.vehicleId,
        startDate: addDays(data.windowStartDate, 4),
        endDate: addDays(data.windowStartDate, 6),
        reason: 'maintenance',
        notes: 'Routine inspection',
        version: 1,
        createdAt,
        updatedAt: createdAt,
      }];
      this.previewReservedDates = new Set([
        addDays(data.windowStartDate, 10),
        addDays(data.windowStartDate, 11),
      ]);
      this.availabilityVersion = 1;
    }

    const days = enumerateDates(data.windowStartDate, data.windowEndDate).map((date) => {
      const ownerBlock = this.previewBlocks.find((block) => date >= block.startDate && date < block.endDate);
      if (ownerBlock) {
        return {
          date,
          status: 'owner_block' as const,
          ownerBlockId: ownerBlock.blockId,
          reason: ownerBlock.reason,
        };
      }
      if (this.previewReservedDates.has(date)) return { date, status: 'reserved' as const };
      return { date, status: 'available' as const };
    });

    return getOwnerVehicleCalendarResultSchema.parse({
      vehicleId: data.vehicleId,
      windowStartDate: data.windowStartDate,
      windowEndDate: data.windowEndDate,
      availabilityVersion: this.availabilityVersion,
      days,
      ownerBlocks: this.previewBlocks.filter((block) =>
        block.endDate > data.windowStartDate && block.startDate < data.windowEndDate),
    });
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

export function createOwnerAvailabilityGateway(): OwnerAvailabilityGateway {
  return new WebOwnerAvailabilityGateway();
}
