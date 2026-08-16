import type { VehicleModerationDetail, VehicleModerationListItem } from '../domain/types';

export const VEHICLE_QUEUE_PAGE_SIZE = 15;

export type ListVehiclesOptions = {
  cursor?: string | null;
  pageSize?: number;
  statusFilter?: string;
};

export type ListVehiclesResult = {
  items: VehicleModerationListItem[];
  hasMore: boolean;
  nextCursor: string | null;
};

export type ReviewVehicleDecision = {
  vehicleId: string;
  expectedVersion: number;
  action: 'approve' | 'reject';
  reason?: string;
  staffEmail: string;
};

export interface AdminVehicleGateway {
  listVehicles(options?: ListVehiclesOptions): Promise<ListVehiclesResult>;
  getVehicleDetail(vehicleId: string): Promise<VehicleModerationDetail | null>;
  reviewVehicle(decision: ReviewVehicleDecision): Promise<{ success: boolean; newVersion: number }>;
}
