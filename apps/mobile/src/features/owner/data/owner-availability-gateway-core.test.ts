import { describe, expect, it } from 'vitest';

import {
  buildGetOwnerCalendarCommand,
  buildRemoveAvailabilityBlockCommand,
  buildSetAvailabilityBlockCommand,
} from './owner-availability-gateway-core';

describe('owner availability gateway commands', () => {
  it('builds strict versioned calendar commands', () => {
    expect(buildGetOwnerCalendarCommand({
      vehicleId: 'vehicle-prado-250',
      windowStartDate: '2026-09-01',
      windowEndDate: '2026-10-01',
    })).toEqual({
      schemaVersion: 1,
      data: {
        vehicleId: 'vehicle-prado-250',
        windowStartDate: '2026-09-01',
        windowEndDate: '2026-10-01',
      },
    });

    expect(buildSetAvailabilityBlockCommand({
      vehicleId: 'vehicle-prado-250',
      startDate: '2026-09-04',
      endDate: '2026-09-06',
      reason: 'maintenance',
      expectedAvailabilityVersion: 3,
    }, 'availability-set-1')).toMatchObject({
      idempotencyKey: 'availability-set-1',
      data: { expectedAvailabilityVersion: 3 },
    });

    expect(buildRemoveAvailabilityBlockCommand({
      vehicleId: 'vehicle-prado-250',
      blockId: 'owner-block-1',
      expectedBlockVersion: 1,
      expectedAvailabilityVersion: 4,
    }, 'availability-remove-1')).toMatchObject({
      idempotencyKey: 'availability-remove-1',
      data: { expectedBlockVersion: 1, expectedAvailabilityVersion: 4 },
    });
  });

  it('rejects injected state and malformed idempotency keys', () => {
    expect(() => buildSetAvailabilityBlockCommand({
      vehicleId: 'vehicle-prado-250',
      startDate: '2026-09-04',
      endDate: '2026-09-06',
      reason: 'maintenance',
      expectedAvailabilityVersion: 0,
      state: 'confirmed',
    } as never, 'availability-set-2')).toThrow();
    expect(() => buildRemoveAvailabilityBlockCommand({
      vehicleId: 'vehicle-prado-250',
      blockId: 'owner-block-1',
      expectedBlockVersion: 1,
      expectedAvailabilityVersion: 1,
    }, 'short')).toThrow();
  });
});
