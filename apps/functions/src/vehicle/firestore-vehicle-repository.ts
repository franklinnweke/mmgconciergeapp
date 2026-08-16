import {
  getFirestore,
  Timestamp,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';

import type {
  StoredVehicleIdempotency,
  VehicleAdminAuditLog,
  VehicleAuditEvent,
  VehicleImageRecord,
  VehicleNotificationOutbox,
  VehiclePrivateRecord,
  VehicleRecord,
  VehicleRepository,
  VehicleRevisionRecord,
  VehicleTransaction,
} from './vehicle-repository.js';

function toIsoString(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return new Date().toISOString();
}

class FirestoreVehicleTransaction implements VehicleTransaction {
  constructor(
    private readonly firestore: Firestore,
    private readonly transaction: Transaction,
  ) {}

  async getOwnerProfile(ownerId: string): Promise<{ verificationStatus: string } | null> {
    const docRef = this.firestore.collection('ownerProfiles').doc(ownerId);
    const snapshot = await this.transaction.get(docRef);
    if (!snapshot.exists) return null;
    const data = snapshot.data();
    if (!data || typeof data.verificationStatus !== 'string') return null;
    return { verificationStatus: data.verificationStatus };
  }

  async getVehicle(vehicleId: string): Promise<VehicleRecord | null> {
    const docRef = this.firestore.collection('vehicles').doc(vehicleId);
    const snapshot = await this.transaction.get(docRef);
    if (!snapshot.exists) return null;
    const data = snapshot.data();
    if (!data) return null;

    return {
      vehicleId: data.vehicleId || vehicleId,
      ownerId: data.ownerId,
      displayName: data.displayName,
      make: data.make ?? null,
      model: data.model ?? null,
      year: data.year ?? null,
      colour: data.colour ?? null,
      category: data.category ?? null,
      seats: data.seats ?? null,
      transmission: data.transmission ?? null,
      fuelType: data.fuelType ?? null,
      mileageKm: data.mileageKm ?? null,
      description: data.description ?? null,
      features: data.features ?? [],
      ownerDailyRateKobo: data.ownerDailyRateKobo ?? null,
      chauffeurPolicy: 'included' as const,
      deliveryPolicy: 'included' as const,
      areaLabel: data.areaLabel ?? null,
      approxLatitude: data.approxLatitude ?? null,
      approxLongitude: data.approxLongitude ?? null,
      moderationStatus: data.moderationStatus,
      visibility: data.visibility,
      discoverable: Boolean(data.discoverable),
      lastDecisionReason: data.lastDecisionReason ?? null,
      pendingRevisionId: data.pendingRevisionId ?? null,
      imageCount: Number(data.imageCount) || 0,
      primaryImagePath: data.primaryImagePath ?? null,
      createdAt: toIsoString(data.createdAt),
      updatedAt: toIsoString(data.updatedAt),
      version: Number(data.version) || 1,
    };
  }

  async getVehiclePrivate(vehicleId: string): Promise<VehiclePrivateRecord | null> {
    const docRef = this.firestore.collection('vehiclePrivate').doc(vehicleId);
    const snapshot = await this.transaction.get(docRef);
    if (!snapshot.exists) return null;
    const data = snapshot.data();
    if (!data) return null;

    return {
      vehicleId: data.vehicleId || vehicleId,
      ownerId: data.ownerId,
      plate: data.plate ?? null,
      baseAddress: data.baseAddress ?? null,
      exactLatitude: data.exactLatitude ?? null,
      exactLongitude: data.exactLongitude ?? null,
      placeId: data.placeId ?? null,
      documentPaths: data.documentPaths ?? [],
      createdAt: toIsoString(data.createdAt),
      updatedAt: toIsoString(data.updatedAt),
    };
  }

  async getVehicleImages(vehicleId: string): Promise<VehicleImageRecord[]> {
    const collRef = this.firestore.collection('vehicles').doc(vehicleId).collection('images');
    const snapshot = await this.transaction.get(collRef.orderBy('order', 'asc'));
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        imageId: data.imageId || doc.id,
        vehicleId: data.vehicleId || vehicleId,
        ownerId: data.ownerId,
        order: Number(data.order) || 0,
        status: data.status,
        width: Number(data.width) || 0,
        height: Number(data.height) || 0,
        originalUploadId: data.originalUploadId,
        variantPaths: data.variantPaths ?? {},
        // Documents written before image processing existed have no `processing`
        // block. They are reconstructed as `sourceGps: 'unknown'` and
        // `metadataStripped: false` — the honest reading, since nothing verified
        // those bytes. `finalizeVehicleImage` overwrites the block when the owner
        // re-uploads.
        processing: {
          sourceFormat: data.processing?.sourceFormat ?? 'jpeg',
          sourceByteSize: Number(data.processing?.sourceByteSize) || 0,
          sourceHadExif: data.processing?.sourceHadExif === true,
          sourceGps: data.processing?.sourceGps ?? 'unknown',
          metadataStripped: data.processing?.metadataStripped === true,
          variants: data.processing?.variants ?? {},
        },
        publicVariantPaths: data.publicVariantPaths ?? null,
        promotedAt: data.promotedAt ? toIsoString(data.promotedAt) : null,
        createdAt: toIsoString(data.createdAt),
        updatedAt: toIsoString(data.updatedAt),
      };
    });
  }

  async getVehicleRevision(revisionId: string): Promise<VehicleRevisionRecord | null> {
    const docRef = this.firestore.collection('vehicleRevisions').doc(revisionId);
    const snapshot = await this.transaction.get(docRef);
    if (!snapshot.exists) return null;
    const data = snapshot.data();
    if (!data) return null;

    return {
      revisionId: data.revisionId || revisionId,
      vehicleId: data.vehicleId,
      ownerId: data.ownerId,
      revisionClass: data.revisionClass,
      safetyCritical: Boolean(data.safetyCritical),
      moderationStatus: data.moderationStatus,
      previousModerationStatus: data.previousModerationStatus,
      previousVisibility: data.previousVisibility,
      proposedChanges: data.proposedChanges ?? {},
      approvedSnapshot: data.approvedSnapshot ?? null,
      createdAt: toIsoString(data.createdAt),
      updatedAt: toIsoString(data.updatedAt),
      version: Number(data.version) || 1,
    };
  }

  async getIdempotency(documentId: string): Promise<StoredVehicleIdempotency | null> {
    const docRef = this.firestore.collection('idempotency').doc(documentId);
    const snapshot = await this.transaction.get(docRef);
    if (!snapshot.exists) return null;
    const data = snapshot.data();
    if (!data) return null;

    return {
      requestHash: data.requestHash,
      commandName: data.commandName,
      actorId: data.actorId,
      result: data.result,
    };
  }

  setVehicle(vehicleId: string, record: VehicleRecord, now: Date): void {
    const docRef = this.firestore.collection('vehicles').doc(vehicleId);
    this.transaction.set(
      docRef,
      {
        ...record,
        updatedAt: Timestamp.fromDate(now),
      },
      { merge: true },
    );
  }

  setVehiclePrivate(vehicleId: string, record: VehiclePrivateRecord, now: Date): void {
    const docRef = this.firestore.collection('vehiclePrivate').doc(vehicleId);
    this.transaction.set(
      docRef,
      {
        ...record,
        updatedAt: Timestamp.fromDate(now),
      },
      { merge: true },
    );
  }

  setVehicleImage(vehicleId: string, imageId: string, record: VehicleImageRecord, now: Date): void {
    const docRef = this.firestore.collection('vehicles').doc(vehicleId).collection('images').doc(imageId);
    this.transaction.set(
      docRef,
      {
        ...record,
        updatedAt: Timestamp.fromDate(now),
      },
      { merge: true },
    );
  }

  setVehicleRevision(revisionId: string, record: VehicleRevisionRecord, now: Date): void {
    const docRef = this.firestore.collection('vehicleRevisions').doc(revisionId);
    this.transaction.set(
      docRef,
      {
        ...record,
        updatedAt: Timestamp.fromDate(now),
      },
      { merge: true },
    );
  }

  createAuditEvent(event: VehicleAuditEvent): void {
    const docRef = this.firestore.collection('auditEvents').doc();
    this.transaction.set(docRef, {
      ...event,
      occurredAt: Timestamp.fromDate(event.occurredAt),
    });
  }

  createAdminAuditLog(record: VehicleAdminAuditLog, now: Date): void {
    const docRef = this.firestore.collection('adminAuditLogs').doc();
    this.transaction.set(docRef, {
      ...record,
      createdAt: Timestamp.fromDate(now),
    });
  }

  createNotificationOutbox(record: VehicleNotificationOutbox, now: Date): void {
    const docRef = this.firestore.collection('notificationOutbox').doc();
    this.transaction.set(docRef, {
      ...record,
      createdAt: Timestamp.fromDate(now),
    });
  }

  saveIdempotency(documentId: string, record: StoredVehicleIdempotency, createdAt: Date): void {
    const docRef = this.firestore.collection('idempotency').doc(documentId);
    this.transaction.set(docRef, {
      ...record,
      createdAt: Timestamp.fromDate(createdAt),
    });
  }
}

export class FirestoreVehicleRepository implements VehicleRepository {
  private readonly firestore: Firestore;

  constructor(firestore?: Firestore) {
    this.firestore = firestore ?? getFirestore();
  }

  async runTransaction<T>(work: (transaction: VehicleTransaction) => Promise<T>): Promise<T> {
    return this.firestore.runTransaction(async (transaction) => {
      const tx = new FirestoreVehicleTransaction(this.firestore, transaction);
      return work(tx);
    });
  }
}
