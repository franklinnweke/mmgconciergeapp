import type {
  OwnerVisibleVehicle,
  VehicleModerationStatus,
  VehicleVisibility,
} from '@mmg/contracts';

import type { GpsPresence, SupportedImageFormat } from './image-processing.js';

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

/** What was actually written for one variant. Every number is measured, not requested. */
export type VehicleImageVariantRecord = {
  path: string;
  width: number;
  height: number;
  byteSize: number;
  contentType: string;
};

/**
 * The processing trail for an image.
 *
 * Required, not optional. An image record cannot exist without stating what was
 * decoded, what the source carried, and what was stripped — that is the whole
 * point of the field, and an optional version would let a record claim
 * `status: 'processed'` while saying nothing about any processing.
 */
export type VehicleImageProcessingFacts = {
  sourceFormat: SupportedImageFormat;
  sourceByteSize: number;
  /** Whether the owner's original carried an EXIF block. */
  sourceHadExif: boolean;
  /** Whether it carried GPS coordinates. `'unknown'` when the block was unparseable. */
  sourceGps: GpsPresence;
  /**
   * True only when the rendered variants were re-encoded with metadata
   * discarded. Set from the render path, never from a request field.
   */
  metadataStripped: boolean;
  /** Keyed by variant name. Present only for variants whose bytes were written. */
  variants: Record<string, VehicleImageVariantRecord>;
};

export type VehicleImageRecord = {
  imageId: string;
  vehicleId: string;
  ownerId: string;
  order: number;
  status: 'processed' | 'rejected' | 'approved';
  /** Orientation-corrected source dimensions, measured by the decoder. */
  width: number;
  height: number;
  originalUploadId: string;
  /** Variant name → private storage path. Every path here points at a written object. */
  variantPaths: Record<string, string>;
  processing: VehicleImageProcessingFacts;
  /**
   * World-readable copies. Non-null only while the vehicle is approved — the
   * public prefix is the only readable one in the bucket, so this doubles as the
   * record of what a renter can currently fetch.
   */
  publicVariantPaths: Record<string, string> | null;
  promotedAt: string | null;
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

export type VehicleAdminAuditLog = {
  logId?: string;
  actorId: string;
  role: string;
  action: string;
  target: string;
  beforeHash: string;
  afterHash: string;
  reason: string | null;
  requestId: string;
  createdAt: Date;
};

export type VehicleNotificationOutbox = {
  eventId?: string;
  eventType: string;
  ownerId: string;
  status: 'unavailable' | 'pending' | 'sent' | 'failed';
  reason?: string;
  createdAt: Date;
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
  createAdminAuditLog?(record: VehicleAdminAuditLog, now: Date): void;
  createNotificationOutbox?(record: VehicleNotificationOutbox, now: Date): void;
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