import { describe, expect, it } from 'vitest';
import { FixtureAdminVehicleGateway, FIXTURE_VEHICLES } from './fixture-admin-vehicle-gateway';

describe('FixtureAdminVehicleGateway', () => {
  it('lists all fixture vehicles by default', async () => {
    const gateway = new FixtureAdminVehicleGateway();
    const result = await gateway.listVehicles();

    expect(result.items.length).toBe(FIXTURE_VEHICLES.length);
    expect(result.hasMore).toBe(false);
  });

  it('filters vehicles by moderation status', async () => {
    const gateway = new FixtureAdminVehicleGateway();
    const pending = await gateway.listVehicles({ statusFilter: 'pending_review' });

    expect(pending.items.every((v) => v.moderationStatus === 'pending_review')).toBe(true);
    expect(pending.items.length).toBeGreaterThan(0);
  });

  it('retrieves detailed vehicle record by vehicleId', async () => {
    const gateway = new FixtureAdminVehicleGateway();
    const vehicle = await gateway.getVehicleDetail('veh-lagos-prado-250-first-edition');

    expect(vehicle).not.toBeNull();
    expect(vehicle?.make).toBe('Toyota');
    expect(vehicle?.model).toBe('Land Cruiser Prado 250');
    expect(vehicle?.images.length).toBeGreaterThanOrEqual(1);
    expect(vehicle?.images[0].isPrimary).toBe(true);
  });

  it('returns null for non-existent vehicle ID', async () => {
    const gateway = new FixtureAdminVehicleGateway();
    const vehicle = await gateway.getVehicleDetail('non-existent-id');

    expect(vehicle).toBeNull();
  });

  it('approves vehicle and increments version', async () => {
    const gateway = new FixtureAdminVehicleGateway();
    const result = await gateway.reviewVehicle({
      vehicleId: 'veh-lagos-prado-250-first-edition',
      expectedVersion: 1,
      action: 'approve',
      staffEmail: 'ops.lead@mmgconcierge.com',
    });

    expect(result.success).toBe(true);
    expect(result.newVersion).toBe(2);

    const updated = await gateway.getVehicleDetail('veh-lagos-prado-250-first-edition');
    expect(updated?.moderationStatus).toBe('approved');
    expect(updated?.reviewedByStaffEmail).toBe('ops.lead@mmgconcierge.com');
  });

  it('rejects vehicle with reason and increments version', async () => {
    const gateway = new FixtureAdminVehicleGateway();
    const result = await gateway.reviewVehicle({
      vehicleId: 'veh-lagos-prado-250-first-edition',
      expectedVersion: 1,
      action: 'reject',
      reason: 'Please upload clearer photo of interior dashboard.',
      staffEmail: 'ops.lead@mmgconcierge.com',
    });

    expect(result.success).toBe(true);
    expect(result.newVersion).toBe(2);

    const updated = await gateway.getVehicleDetail('veh-lagos-prado-250-first-edition');
    expect(updated?.moderationStatus).toBe('rejected');
    expect(updated?.lastDecisionReason).toBe('Please upload clearer photo of interior dashboard.');
  });

  it('throws version conflict when expectedVersion does not match', async () => {
    const gateway = new FixtureAdminVehicleGateway();

    await expect(
      gateway.reviewVehicle({
        vehicleId: 'veh-lagos-prado-250-first-edition',
        expectedVersion: 99, // Stale version
        action: 'approve',
        staffEmail: 'ops.lead@mmgconcierge.com',
      }),
    ).rejects.toThrow(/Version conflict/);
  });
});
