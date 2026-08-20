import { describe, expect, it } from 'vitest';

import { WebOwnerAvailabilityGateway } from './owner-availability-gateway.web';

describe('web owner availability preview gateway', () => {
  it('keeps sample writes local, versioned, and reversible', async () => {
    const gateway = new WebOwnerAvailabilityGateway();
    const calendar = await gateway.getCalendar({
      vehicleId: 'preview-prado',
      windowStartDate: '2026-08-20',
      windowEndDate: '2026-09-24',
    });
    const created = await gateway.setBlock({
      vehicleId: 'preview-prado',
      startDate: '2026-08-27',
      endDate: '2026-08-29',
      reason: 'owner_use',
      expectedAvailabilityVersion: calendar.availabilityVersion,
    }, 'preview-owner-set-command');

    expect(created.result.availabilityVersion).toBe(calendar.availabilityVersion + 1);
    expect((await gateway.getCalendar({
      vehicleId: 'preview-prado',
      windowStartDate: '2026-08-20',
      windowEndDate: '2026-09-24',
    })).days.find((day) => day.date === '2026-08-27')).toMatchObject({
      status: 'owner_block',
      reason: 'owner_use',
    });

    const removed = await gateway.removeBlock({
      vehicleId: 'preview-prado',
      blockId: created.result.block.blockId,
      expectedBlockVersion: created.result.block.version,
      expectedAvailabilityVersion: created.result.availabilityVersion,
    }, 'preview-owner-remove-command');
    expect(removed.result.removed).toBe(true);
  });
});
