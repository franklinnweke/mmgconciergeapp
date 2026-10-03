import { ownerVehicleImagePreviewResultSchema } from '@mmg/contracts';
import { getFunctions, httpsCallable } from 'firebase/functions';

export async function fetchOwnerImagePreview(vehicleId: string) {
  const response = await httpsCallable(getFunctions(undefined, 'africa-south1'), 'getOwnerVehicleImagePreview')({ vehicleId, variant: 'card' });
  return ownerVehicleImagePreviewResultSchema.parse(response.data);
}
