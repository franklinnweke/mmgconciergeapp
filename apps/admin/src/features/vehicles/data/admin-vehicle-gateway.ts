import type { VehicleModerationStatus } from '@mmg/contracts';

import type { VehicleModerationDetail, VehicleModerationListItem } from '../domain/types';

export const VEHICLE_QUEUE_PAGE_SIZE = 15;

export type ListVehiclesOptions = {
  cursor?: string | null;
  pageSize?: number;
  statusFilter?: VehicleModerationStatus | 'all';
};

export type ListVehiclesResult = {
  items: VehicleModerationListItem[];
  hasMore: boolean;
  nextCursor: string | null;
};

export interface AdminVehicleGateway {
  listVehicles(options?: ListVehiclesOptions): Promise<ListVehiclesResult>;
  getVehicleDetail(vehicleId: string): Promise<VehicleModerationDetail | null>;
  mintSignedImageUrl(storagePath: string): Promise<string | null>;
}
