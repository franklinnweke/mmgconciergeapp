import { describe, expect, it, vi } from 'vitest';
import { getOwnerVehicleImagePreviewService } from './owner-image-preview-service.js';
import { vehicleFixture, vehicleImageFixture } from './vehicle-repository-fake.js';

const auth = { uid: 'owner-1', token: { email_verified: true, email: 'owner@example.test' } };
function setup() {
  const vehicle = vehicleFixture();
  const image = vehicleImageFixture();
  const deps = { load: vi.fn(async () => ({ vehicle, images: [image] })), sign: vi.fn(async () => 'https://storage.googleapis.com/test?signature=test'), now: () => 0 };
  return { vehicle, image, deps };
}
describe('owner image preview', () => {
  it('signs only the trusted processed card for five minutes', async () => {
    const { deps, image } = setup();
    const result = await getOwnerVehicleImagePreviewService({ vehicleId: 'veh-01' }, auth, deps);
    expect(deps.sign).toHaveBeenCalledWith(image.variantPaths.card, new Date(300000));
    expect(result).toEqual({ url: 'https://storage.googleapis.com/test?signature=test', expiresAt: new Date(300000).toISOString() });
  });
  it('denies signed-out callers before reading', async () => {
    const { deps } = setup();
    await expect(getOwnerVehicleImagePreviewService({ vehicleId: 'veh-01' }, undefined, deps)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(deps.load).not.toHaveBeenCalled();
  });
  it('denies another owner without signing', async () => {
    const { deps } = setup();
    await expect(getOwnerVehicleImagePreviewService({ vehicleId: 'veh-01' }, { ...auth, uid: 'owner-2' }, deps)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(deps.sign).not.toHaveBeenCalled();
  });
  it.each([{ vehicleId: '../secret' }, { vehicleId: 'veh-01', path: 'private/other' }, { vehicleId: 'veh-01', variant: 'original' }, { vehicleId: 'veh-01', variant: 'detail' }])('rejects path injection and disallowed variants %j', async (input) => {
    const { deps } = setup();
await expect(getOwnerVehicleImagePreviewService(input, auth, deps)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(deps.load).not.toHaveBeenCalled();
  });
  it.each(['rejected', 'missing', 'wrong_path', 'unprocessed', 'missing_object'])('fails closed for %s image', async (state) => {
    const { deps, image } = setup();
    if (state === 'rejected') image.status = 'rejected';
    if (state === 'missing') deps.load.mockResolvedValue({ vehicle: vehicleFixture(), images: [] });
    if (state === 'wrong_path') image.variantPaths.card = 'private/original';
    if (state === 'unprocessed') image.processing.metadataStripped = false;
    if (state === 'missing_object') deps.sign.mockResolvedValue(null as never);
    await expect(getOwnerVehicleImagePreviewService({ vehicleId: 'veh-01' }, auth, deps)).rejects.toMatchObject({ code: 'FAILED_PRECONDITION' });
  });
  it('fails safely for nonexistent vehicles', async () => {
    const { deps } = setup();
    deps.load.mockResolvedValue({ vehicle: null as never, images: [] });
    await expect(getOwnerVehicleImagePreviewService({ vehicleId: 'veh-01' }, auth, deps)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(deps.sign).not.toHaveBeenCalled();
  });
});
