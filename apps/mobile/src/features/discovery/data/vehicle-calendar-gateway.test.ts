import { describe, expect, it } from 'vitest';

import { buildGetVehicleCalendarCommand } from './vehicle-calendar-gateway-core';
import { WebVehicleCalendarGateway } from './vehicle-calendar-gateway.web';

describe('renter vehicle calendar gateway', () => {
  it('builds a strict privacy-safe calendar command', () => {
    expect(buildGetVehicleCalendarCommand({
      vehicleId: 'preview-prado',
      windowStartDate: '2026-08-20',
      windowEndDate: '2026-08-27',
    })).toEqual({
      schemaVersion: 1,
      data: {
        vehicleId: 'preview-prado',
        windowStartDate: '2026-08-20',
        windowEndDate: '2026-08-27',
      },
    });
  });

  it('never exposes preview owner block reasons or identifiers', async () => {
    const result = await new WebVehicleCalendarGateway().getCalendar({
      vehicleId: 'preview-prado',
      windowStartDate: '2026-08-20',
      windowEndDate: '2026-08-27',
    });

    expect(result.days.some((day) => !day.available)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/owner|maintenance|reason|blockId/i);
  });
});
