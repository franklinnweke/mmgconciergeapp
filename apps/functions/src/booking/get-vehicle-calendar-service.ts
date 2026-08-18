import {
  BookingCommandError,
  getVehicleCalendarCommandSchema,
  getVehicleCalendarResultSchema,
  type GetVehicleCalendarCommand,
  type GetVehicleCalendarResult,
} from '@mmg/contracts';
import {
  calculateChargedDays,
  mergeCalendarDays,
} from '@mmg/domain';

import type { BookingRepository } from './booking-repository.js';

export type GetVehicleCalendarDependencies = {
  repository: BookingRepository;
  now?: () => Date;
};

export async function getVehicleCalendar(
  untrustedCommand: unknown,
  dependencies: GetVehicleCalendarDependencies,
): Promise<GetVehicleCalendarResult> {
  const parsed = getVehicleCalendarCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) {
    throw new BookingCommandError('INVALID_ARGUMENT', 'Get vehicle calendar command is invalid.');
  }

  const command: GetVehicleCalendarCommand = parsed.data;
  const now = (dependencies.now ?? (() => new Date()))();

  try {
    calculateChargedDays(command.data.windowStartDate, command.data.windowEndDate);
  } catch {
    throw new BookingCommandError(
      'INVALID_ARGUMENT',
      'Window end date must be after window start date and within 365 days.',
    );
  }

  return dependencies.repository.runTransaction(async (transaction) => {
    const vehicle = await transaction.getVehicle(command.data.vehicleId);
    if (!vehicle) {
      throw new BookingCommandError('NOT_FOUND', 'Vehicle listing was not found.');
    }

    const blocks = await transaction.getAvailabilityBlocksInWindow(
      command.data.vehicleId,
      command.data.windowStartDate,
      command.data.windowEndDate,
    );

    const mergedDays = mergeCalendarDays(
      command.data.windowStartDate,
      command.data.windowEndDate,
      blocks,
      now,
    );

    const response: GetVehicleCalendarResult = {
      vehicleId: command.data.vehicleId,
      windowStartDate: command.data.windowStartDate,
      windowEndDate: command.data.windowEndDate,
      days: mergedDays,
      blocks: blocks.map((b) => ({
        blockId: b.blockId,
        vehicleId: b.vehicleId,
        ownerId: b.ownerId,
        startDate: b.startDate,
        endDate: b.endDate,
        type: b.type,
        reason: b.reason,
        referenceId: b.referenceId,
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
      })),
    };

    return getVehicleCalendarResultSchema.parse(response);
  });
}
