import type {
  OwnerVisibleVehicle,
  VehicleModerationStatus,
  VehicleVisibility,
} from '@mmg/contracts';

// ── Trusted records ──

export type VehicleRecord = OwnerVisibleVehicle;

export type VehiclePrivateRecord = {
  vehicleId: string;
  ownerId: string;
  plate: string | null;
  baseAddress: Record<string, unknown> | null;
  exactLatitude: number | null;
  exactLongitude: number | null;
  placeId: string | null;
  documentPaths: string[];
  createdAt: string;
  updatedAt: string;
};

export type VehicleImageRecord = {
  imageId: string;
  vehicleId: string;
  ownerId: string;
  order: number;
  status: 'processed' | 'rejected';
  width: number;
  height: number;
  originalUploadId: string;
  variantPaths: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

export type VehicleRevisionRecord = {
  revisionId: string;
  vehicleId: string;
  ownerId: string;
  revisionClass: 'minor' | 'major';
  safetyCritical: boolean;
  moderationStatus: VehicleModerationStatus;
  previousModerationStatus: VehicleModerationStatus;
  previousVisibility: VehicleVisibility;
  proposedChanges: Record<string, unknown>;
  approvedSnapshot: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  version: number;
};

// ── Repository interface ──

export interface VehicleTransaction {
  getOwnerProfile(ownerId: string): Promise<{ verificationStatus: string } | null>;
  getVehicle(vehicleId: string): Promise<VehicleRecord | null>;
  getVehiclePrivate(vehicleId: string): Promise<VehiclePrivateRecord | null>;
  getVehicleImages(vehicleId: string): Promise<VehicleImageRecord[]>;
  getVehicleRevision(revisionId: string): Promise<VehicleRevisionRecord | null>;
  getIdempotency(documentId: string): Promise<StoredVehicleIdempotency | null>;

  setVehicle(vehicleId: string, record: VehicleRecord, now: Date): void;
  setVehiclePrivate(vehicleId: string, record: VehiclePrivateRecord, now: Date): void;
  setVehicleImage(vehicleId: string, imageId: string, record: VehicleImageRecord, now: Date): void;
  setVehicleRevision(revisionId: string, record: VehicleRevisionRecord, now: Date): void;

  createAuditEvent(event: VehicleAuditEvent): void;
  saveIdempotency(documentId: string, record: StoredVehicleIdempotency, createdAt: Date): void;
}

export interface VehicleRepository {
  runTransaction<T>(work: (transaction: VehicleTransaction) => Promise<T>): Promise<T>;
}

// ── Supporting types ──

export type StoredVehicleIdempotency = {
  requestHash: string;
  commandName: string;
  actorId: string;
  result: unknown;
};

export type VehicleAuditEvent = {
  actorId: string;
  actorType: 'owner' | 'vehicle_admin' | 'super_admin' | 'system';
  entityId: string;
  entityType: 'vehicle' | 'vehiclePrivate' | 'vehicleImage' | 'vehicleRevision';
  eventType: string;
  fromState?: string | null;
  toState?: string | null;
  requestId: string;
  occurredAt: Date;
  details?: Record<string, unknown>;
};