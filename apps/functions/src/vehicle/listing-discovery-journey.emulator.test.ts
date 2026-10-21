import { randomUUID } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import sharp from 'sharp';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { FirestoreDiscoveryVehicleSource, getVehicleDetailsService, searchVehiclesService } from '../discovery/search-vehicles-service.js';
import { createVehicleDraft } from './create-vehicle-draft-service.js';
import { createVehicleUploadSession } from './create-vehicle-upload-session-service.js';
import { finalizeVehicleImage } from './finalize-vehicle-image-service.js';
import { FirestoreVehicleRepository } from './firestore-vehicle-repository.js';
import { reviewVehicle } from './review-vehicle-service.js';
import { setVehicleVisibility } from './set-vehicle-visibility-service.js';
import { SharpImageProcessor } from './sharp-image-processor.js';
import { submitVehicleForReview } from './submit-vehicle-for-review-service.js';
import { InMemoryVehicleStorageGateway } from './vehicle-storage-gateway.js';

const describeWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
const bucketName = 'mmg-concierge-dev.firebasestorage.app';
const checklist = {
  images_complete_and_legible: true, specs_match_images: true, plate_matches_documents: true,
  lagos_base_plausible: true, rate_plausible: true, chauffeur_delivery_included: true, no_fraud_indicators: true,
};

describeWithEmulator('area-only listing creation to renter discovery', () => {
  let db: Firestore;
  let repository: FirestoreVehicleRepository;
  let source: FirestoreDiscoveryVehicleSource;
  let storage: InMemoryVehicleStorageGateway;
  let vehicleId: string;
  let ownerId: string;
  let staffId: string;

  beforeAll(() => {
    const app = getApps().find((candidate) => candidate.name === 'listing-discovery-emulator') ??
      initializeApp({ projectId: 'mmg-concierge-dev' }, 'listing-discovery-emulator');
    db = getFirestore(app);
    repository = new FirestoreVehicleRepository(db);
    source = new FirestoreDiscoveryVehicleSource(db);
  });

  beforeEach(async () => {
    vehicleId = `listing-regression-${randomUUID()}`;
    ownerId = `owner-${randomUUID()}`;
    staffId = `staff-${randomUUID()}`;
    storage = new InMemoryVehicleStorageGateway();
    await db.doc(`ownerProfiles/${ownerId}`).set({ verificationStatus: 'approved' });
  });

  afterEach(async () => {
    await db.recursiveDelete(db.doc(`vehicles/${vehicleId}`));
    await db.doc(`vehiclePrivate/${vehicleId}`).delete();
    await db.doc(`ownerProfiles/${ownerId}`).delete();
    for (const [collection, field, value] of [
      ['auditEvents', 'entityId', vehicleId], ['adminAuditLogs', 'target', `vehicles/${vehicleId}`],
      ['notificationOutbox', 'ownerId', ownerId], ['idempotencyKeys', 'actorId', ownerId], ['idempotencyKeys', 'actorId', staffId],
    ]) {
      const docs = await db.collection(collection).where(field, '==', value).get();
      await Promise.all(docs.docs.map((document) => document.ref.delete()));
    }
  });

  async function createThroughApproval() {
    // Matches the actual mobile wizard: area + address, no exactBase pin.
    await createVehicleDraft({ schemaVersion: 1, idempotencyKey: 'listing-create-regression', data: {
      specs: { make: 'Toyota', model: 'Prado', year: 2024, colour: 'Black', category: 'executive_suv', seats: 7,
        transmission: 'automatic', fuelType: 'petrol', features: ['leather'],
        description: 'Chauffeur-driven vehicle prepared for executive journeys throughout Lagos.' },
      areaLabel: 'Ikoyi', baseAddress: { line1: '12 Example Road', areaLabel: 'Ikoyi', city: 'Lagos', country: 'NG' },
      plate: 'AAA-123BB', ownerDailyRateKobo: 15_000_000,
    } }, ownerId, { repository, createVehicleId: () => vehicleId });

    const bytes = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#343434' } }).jpeg().toBuffer();
    const upload = await createVehicleUploadSession({ schemaVersion: 1, idempotencyKey: 'listing-upload-regression', data: {
      vehicleId, purpose: 'listing_image', contentType: 'image/jpeg', byteSize: bytes.length, originalFileName: 'vehicle.jpg',
    } }, ownerId, { repository });
    await storage.writeObject(upload.result.storagePath, bytes, { contentType: 'image/jpeg', metadata: { ownerId, purpose: 'vehicle_image' } });
    await finalizeVehicleImage({ schemaVersion: 1, idempotencyKey: 'listing-finalize-regression', data: {
      vehicleId, uploadId: upload.result.uploadId, order: 0,
    } }, ownerId, { repository, storageGateway: storage, imageProcessor: new SharpImageProcessor() });

    const version = (await db.doc(`vehicles/${vehicleId}`).get()).data()!.version;
    const submitted = await submitVehicleForReview({ schemaVersion: 1, idempotencyKey: 'listing-submit-regression', data: { vehicleId, expectedVersion: version } }, ownerId, { repository });
    expect((await getVehicleDetailsService(vehicleId, source, bucketName)).vehicle).toBeNull();
    const approved = await reviewVehicle({ schemaVersion: 1, idempotencyKey: 'listing-review-regression', data: {
      vehicleId, expectedVersion: submitted.result.version, decision: 'approve', checklist,
    } }, { uid: staffId, role: 'vehicle_admin' }, { repository, storageGateway: storage });
    expect((await getVehicleDetailsService(vehicleId, source, bucketName)).vehicle).toBeNull();
    return approved.result.version;
  }

  async function activate(version: number) {
    await setVehicleVisibility({ schemaVersion: 1, idempotencyKey: 'listing-activate-regression', data: {
      vehicleId, expectedVersion: version, visibility: 'active',
    } }, ownerId, { repository, storageGateway: storage });
  }

  it('creates, processes, submits, approves, publishes and returns an area-only listing to renters', async () => {
    await activate(await createThroughApproval());
    const result = await searchVehiclesService({ areaLabel: 'Ikoyi', originLat: 6.45, originLng: 3.43, radiusKm: 1 }, source, bucketName);
    const vehicle = result.vehicles.find((candidate) => candidate.vehicleId === vehicleId);
    expect(vehicle).toMatchObject({ vehicleId, approxLatitude: 6.45, approxLongitude: 3.43, distanceKm: 0 });
    expect(vehicle?.primaryImageUrl).toContain('public%2Fvehicles%2F');
    const images = await db.collection(`vehicles/${vehicleId}/images`).get();
    expect(storage.objects.has(images.docs[0].data().publicVariantPaths.card)).toBe(true);
    expect((await db.doc(`vehiclePrivate/${vehicleId}`).get()).data()).toMatchObject({ exactLatitude: null, exactLongitude: null, placeId: null });
    expect(JSON.stringify(vehicle)).not.toContain(ownerId);
    expect(JSON.stringify(vehicle)).not.toContain('12 Example Road');
    expect(JSON.stringify(vehicle)).not.toContain('private/');
  });

  it('recovers legacy null-coordinate records through search and detail without a data migration', async () => {
    await activate(await createThroughApproval());
    const ref = db.doc(`vehicles/${vehicleId}`);
    await ref.update({ approxLatitude: null, approxLongitude: null });
    const before = (await ref.get()).data();
    const search = await searchVehiclesService({}, source, bucketName);
    expect(search.vehicles.some((candidate) => candidate.vehicleId === vehicleId)).toBe(true);
    expect((await getVehicleDetailsService(vehicleId, source, bucketName)).vehicle).toMatchObject({ vehicleId, approxLatitude: 6.45, approxLongitude: 3.43 });
    expect((await ref.get()).data()).toEqual(before);
  });

  it('fails closed on a malformed location instead of substituting another area', async () => {
    await activate(await createThroughApproval());
    await db.doc(`vehicles/${vehicleId}`).update({ approxLongitude: null });
    expect((await getVehicleDetailsService(vehicleId, source, bucketName)).vehicle).toBeNull();
    const result = await searchVehiclesService({}, source, bucketName);
    expect(result.vehicles.some((candidate) => candidate.vehicleId === vehicleId)).toBe(false);
  });
});
