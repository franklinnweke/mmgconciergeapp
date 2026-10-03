import { ownerVehicleImagePreviewInputSchema, ownerVehicleImagePreviewResultSchema } from '@mmg/contracts';
import { CommandError } from '../errors.js';
import { requireVerifiedEmailOwnerAuth, type CallableAuth } from './callable-auth.js';
import { privateVariantPath } from './image-processing.js';
import type { VehicleImageRecord, VehicleRecord } from './vehicle-repository.js';

export interface OwnerImagePreviewDependencies {
  load(vehicleId: string): Promise<{ vehicle: VehicleRecord | null; images: VehicleImageRecord[] }>;
  sign(path: string, expiresAt: Date): Promise<string | null>;
  now?: () => number;
}

export async function getOwnerVehicleImagePreviewService(input: unknown, auth: CallableAuth, deps: OwnerImagePreviewDependencies) {
  const { uid } = requireVerifiedEmailOwnerAuth(auth);
  const parsed = ownerVehicleImagePreviewInputSchema.safeParse(input);
if (!parsed.success) throw new CommandError('INVALID_ARGUMENT', 'Invalid vehicle image request.');
  const { vehicleId, variant } = parsed.data;
  const { vehicle, images } = await deps.load(vehicleId);
  // Same response for nonexistent and cross-owner records; never leak inventory.
  if (!vehicle || vehicle.vehicleId !== vehicleId || vehicle.ownerId !== uid || vehicle.visibility === 'deleted') {
    throw new CommandError('FORBIDDEN', 'Vehicle preview is unavailable.');
  }
  const image = images.find((candidate) => {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(candidate.imageId)) return false;
    const path = privateVariantPath(uid, vehicleId, candidate.imageId, variant);
    return candidate.ownerId === uid && candidate.vehicleId === vehicleId
      && ['processed', 'approved'].includes(candidate.status)
      && candidate.processing.metadataStripped === true
      && candidate.variantPaths[variant] === path
      && candidate.processing.variants[variant]?.path === path
      && vehicle.primaryImagePath === path;
  });
  if (!image) throw new CommandError('FAILED_PRECONDITION', 'Vehicle image is unavailable.');
  const expiresAt = new Date((deps.now ?? Date.now)() + 5 * 60 * 1000);
  const path = privateVariantPath(uid, vehicleId, image.imageId, variant);
  const url = await deps.sign(path, expiresAt);
  if (!url) throw new CommandError('FAILED_PRECONDITION', 'Vehicle image is unavailable.');
  return ownerVehicleImagePreviewResultSchema.parse({ url, expiresAt: expiresAt.toISOString() });
}
