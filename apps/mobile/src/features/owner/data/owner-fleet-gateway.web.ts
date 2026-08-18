import {
  CreateVehicleDraftCommand,
  CreateVehicleDraftData,
  CreateVehicleDraftResult,
  CreateVehicleUploadSessionCommand,
  CreateVehicleUploadSessionData,
  CreateVehicleUploadSessionResult,
  FinalizeVehicleImageCommand,
  FinalizeVehicleImageData,
  FinalizeVehicleImageResult,
  GetVehicleCalendarCommand,
  GetVehicleCalendarData,
  GetVehicleCalendarResult,
  OwnerVisibleVehicle,
  RemoveVehicleAvailabilityBlockCommand,
  RemoveVehicleAvailabilityBlockData,
  RemoveVehicleAvailabilityBlockResult,
  SetVehicleAvailabilityBlockCommand,
  SetVehicleAvailabilityBlockData,
  SetVehicleAvailabilityBlockResult,
  SetVehicleVisibilityCommand,
  SetVehicleVisibilityData,
  SetVehicleVisibilityResult,
  SubmitVehicleForReviewCommand,
  SubmitVehicleForReviewData,
  SubmitVehicleForReviewResult,
  createVehicleDraftCommandSchema,
  createVehicleUploadSessionCommandSchema,
  finalizeVehicleImageCommandSchema,
  getVehicleCalendarCommandSchema,
  removeVehicleAvailabilityBlockCommandSchema,
  setVehicleAvailabilityBlockCommandSchema,
  setVehicleVisibilityCommandSchema,
  submitVehicleForReviewCommandSchema,
} from '@mmg/contracts';
import {
  collection,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getStorage, ref, uploadBytes } from 'firebase/storage';

import { OwnerFleetGateway } from './owner-fleet-gateway';

function generateIdempotencyKey(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

export class WebOwnerFleetGateway implements OwnerFleetGateway {
  private get functions() {
    return getFunctions(undefined, 'africa-south1');
  }

  private get firestore() {
    return getFirestore();
  }

  private get storage() {
    return getStorage();
  }

  subscribeOwnerVehicles(
    ownerId: string,
    onVehicles: (vehicles: OwnerVisibleVehicle[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    const vehiclesRef = collection(this.firestore, 'vehicles');
    const q = query(
      vehiclesRef,
      where('ownerId', '==', ownerId),
      orderBy('createdAt', 'desc'),
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const vehicles: OwnerVisibleVehicle[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          vehicles.push({
            vehicleId: docSnap.id,
            ownerId: d.ownerId,
            displayName: d.displayName,
            category: d.category,
            seats: d.seats,
            transmission: d.transmission,
            fuelType: d.fuelType,
            mileageKm: d.mileageKm ?? null,
            year: d.year,
            make: d.make,
            model: d.model,
            colour: d.colour,
            areaLabel: d.areaLabel,
            approxLatitude: d.approxLatitude,
            approxLongitude: d.approxLongitude,
            ownerDailyRateKobo: d.ownerDailyRateKobo,
            chauffeurPolicy: 'included',
            deliveryPolicy: 'included',
            description: d.description || '',
            features: d.features || [],
            moderationStatus: d.moderationStatus,
            visibility: d.visibility,
            discoverable: Boolean(d.discoverable),
            lastDecisionReason: d.lastDecisionReason ?? null,
            pendingRevisionId: d.pendingRevisionId ?? null,
            imageCount: d.imageCount ?? 0,
            primaryImagePath: d.primaryImagePath ?? null,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
            version: d.version ?? 1,
          });
        });
        onVehicles(vehicles);
      },
      (err) => onError(err),
    );
  }

  async getOwnerVehicle(vehicleId: string): Promise<OwnerVisibleVehicle | null> {
    const docRef = doc(this.firestore, 'vehicles', vehicleId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      vehicleId: snap.id,
      ownerId: d.ownerId,
      displayName: d.displayName,
      category: d.category,
      seats: d.seats,
      transmission: d.transmission,
      fuelType: d.fuelType,
      mileageKm: d.mileageKm ?? null,
      year: d.year,
      make: d.make,
      model: d.model,
      colour: d.colour,
      areaLabel: d.areaLabel,
      approxLatitude: d.approxLatitude,
      approxLongitude: d.approxLongitude,
      ownerDailyRateKobo: d.ownerDailyRateKobo,
      chauffeurPolicy: 'included',
      deliveryPolicy: 'included',
      description: d.description || '',
      features: d.features || [],
      moderationStatus: d.moderationStatus,
      visibility: d.visibility,
      discoverable: Boolean(d.discoverable),
      lastDecisionReason: d.lastDecisionReason ?? null,
      pendingRevisionId: d.pendingRevisionId ?? null,
      imageCount: d.imageCount ?? 0,
      primaryImagePath: d.primaryImagePath ?? null,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      version: d.version ?? 1,
    };
  }

  async createDraft(data: CreateVehicleDraftData): Promise<CreateVehicleDraftResult> {
    const command: CreateVehicleDraftCommand = createVehicleDraftCommandSchema.parse({
      schemaVersion: 1,
      idempotencyKey: generateIdempotencyKey('draft'),
      data,
    });
    const callable = httpsCallable<CreateVehicleDraftCommand, CreateVehicleDraftResult>(
      this.functions,
      'createVehicleDraft',
    );
    const res = await callable(command);
    return res.data;
  }

  async createUploadSession(data: CreateVehicleUploadSessionData): Promise<CreateVehicleUploadSessionResult> {
    const command: CreateVehicleUploadSessionCommand = createVehicleUploadSessionCommandSchema.parse({
      schemaVersion: 1,
      idempotencyKey: generateIdempotencyKey('upload_sess'),
      data,
    });
    const callable = httpsCallable<CreateVehicleUploadSessionCommand, CreateVehicleUploadSessionResult>(
      this.functions,
      'createVehicleUploadSession',
    );
    const res = await callable(command);
    return res.data;
  }

  async uploadVehiclePhoto(storagePath: string, fileUri: string, contentType: string): Promise<void> {
    const fileRef = ref(this.storage, storagePath);
    const response = await fetch(fileUri);
    const blob = await response.blob();
    await uploadBytes(fileRef, blob, { contentType });
  }

  async finalizeImage(data: FinalizeVehicleImageData): Promise<FinalizeVehicleImageResult> {
    const command: FinalizeVehicleImageCommand = finalizeVehicleImageCommandSchema.parse({
      schemaVersion: 1,
      idempotencyKey: generateIdempotencyKey('finalize_img'),
      data,
    });
    const callable = httpsCallable<FinalizeVehicleImageCommand, FinalizeVehicleImageResult>(
      this.functions,
      'finalizeVehicleImage',
    );
    const res = await callable(command);
    return res.data;
  }

  async submitForReview(data: SubmitVehicleForReviewData): Promise<SubmitVehicleForReviewResult> {
    const command: SubmitVehicleForReviewCommand = submitVehicleForReviewCommandSchema.parse({
      schemaVersion: 1,
      idempotencyKey: generateIdempotencyKey('submit_veh'),
      data,
    });
    const callable = httpsCallable<SubmitVehicleForReviewCommand, SubmitVehicleForReviewResult>(
      this.functions,
      'submitVehicleForReview',
    );
    const res = await callable(command);
    return res.data;
  }

  async setVisibility(data: SetVehicleVisibilityData): Promise<SetVehicleVisibilityResult> {
    const command: SetVehicleVisibilityCommand = setVehicleVisibilityCommandSchema.parse({
      schemaVersion: 1,
      idempotencyKey: generateIdempotencyKey('visibility'),
      data,
    });
    const callable = httpsCallable<SetVehicleVisibilityCommand, SetVehicleVisibilityResult>(
      this.functions,
      'setVehicleVisibility',
    );
    const res = await callable(command);
    return res.data;
  }

  async setAvailabilityBlock(data: SetVehicleAvailabilityBlockData): Promise<SetVehicleAvailabilityBlockResult> {
    const command: SetVehicleAvailabilityBlockCommand = setVehicleAvailabilityBlockCommandSchema.parse({
      schemaVersion: 1,
      idempotencyKey: generateIdempotencyKey('avail_block'),
      data,
    });
    const callable = httpsCallable<SetVehicleAvailabilityBlockCommand, SetVehicleAvailabilityBlockResult>(
      this.functions,
      'setVehicleAvailabilityBlock',
    );
    const res = await callable(command);
    return res.data;
  }

  async removeAvailabilityBlock(data: RemoveVehicleAvailabilityBlockData): Promise<RemoveVehicleAvailabilityBlockResult> {
    const command: RemoveVehicleAvailabilityBlockCommand = removeVehicleAvailabilityBlockCommandSchema.parse({
      schemaVersion: 1,
      idempotencyKey: generateIdempotencyKey('rm_avail_block'),
      data,
    });
    const callable = httpsCallable<RemoveVehicleAvailabilityBlockCommand, RemoveVehicleAvailabilityBlockResult>(
      this.functions,
      'removeVehicleAvailabilityBlock',
    );
    const res = await callable(command);
    return res.data;
  }

  async getCalendar(data: GetVehicleCalendarData): Promise<GetVehicleCalendarResult> {
    const command: GetVehicleCalendarCommand = getVehicleCalendarCommandSchema.parse({
      schemaVersion: 1,
      data,
    });
    const callable = httpsCallable<GetVehicleCalendarCommand, GetVehicleCalendarResult>(
      this.functions,
      'getVehicleCalendar',
    );
    const res = await callable(command);
    return res.data;
  }
}

export function createOwnerFleetGateway(): OwnerFleetGateway {
  return new WebOwnerFleetGateway();
}
