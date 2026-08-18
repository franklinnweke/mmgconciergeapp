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
  OwnerVisibleVehicle,
  SetVehicleVisibilityCommand,
  SetVehicleVisibilityData,
  SetVehicleVisibilityResult,
  SubmitVehicleForReviewCommand,
  SubmitVehicleForReviewData,
  SubmitVehicleForReviewResult,
  createVehicleDraftCommandSchema,
  createVehicleDraftResultSchema,
  createVehicleUploadSessionCommandSchema,
  createVehicleUploadSessionResultSchema,
  finalizeVehicleImageCommandSchema,
  finalizeVehicleImageResultSchema,
  setVehicleVisibilityCommandSchema,
  setVehicleVisibilityResultSchema,
  submitVehicleForReviewCommandSchema,
  submitVehicleForReviewResultSchema,
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
  type DocumentSnapshot,
  type QuerySnapshot,
} from '@react-native-firebase/firestore';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import { getStorage, putFile, ref } from '@react-native-firebase/storage';

import { parseCallableResult } from '@/core/firebase/parse-callable-result';

export type Unsubscribe = () => void;

export interface OwnerFleetGateway {
  subscribeOwnerVehicles(
    ownerId: string,
    onVehicles: (vehicles: OwnerVisibleVehicle[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;
  getOwnerVehicle(vehicleId: string): Promise<OwnerVisibleVehicle | null>;
  createDraft(data: CreateVehicleDraftData): Promise<CreateVehicleDraftResult>;
  createUploadSession(data: CreateVehicleUploadSessionData): Promise<CreateVehicleUploadSessionResult>;
  uploadVehiclePhoto(storagePath: string, fileUri: string, contentType: string): Promise<void>;
  finalizeImage(data: FinalizeVehicleImageData): Promise<FinalizeVehicleImageResult>;
  submitForReview(data: SubmitVehicleForReviewData): Promise<SubmitVehicleForReviewResult>;
  setVisibility(data: SetVehicleVisibilityData): Promise<SetVehicleVisibilityResult>;
}

function generateIdempotencyKey(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

export class NativeOwnerFleetGateway implements OwnerFleetGateway {
  private get functions() {
    return getFunctions(undefined, 'africa-south1');
  }

  private get firestore() {
    return getFirestore();
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
      (snapshot: QuerySnapshot) => {
        const vehicles: OwnerVisibleVehicle[] = [];
        snapshot.forEach((docSnap: DocumentSnapshot) => {
          const d = docSnap.data();
          if (!d) return;
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
      (err: Error) => onError(err),
    );
  }

  async getOwnerVehicle(vehicleId: string): Promise<OwnerVisibleVehicle | null> {
    const docRef = doc(this.firestore, 'vehicles', vehicleId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const d = snap.data();
    if (!d) return null;
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
    const callable = httpsCallable(this.functions, 'createVehicleDraft');
    const res = await callable(command);
    return parseCallableResult(createVehicleDraftResultSchema, res.data, 'createVehicleDraft');
  }

  async createUploadSession(data: CreateVehicleUploadSessionData): Promise<CreateVehicleUploadSessionResult> {
    const command: CreateVehicleUploadSessionCommand = createVehicleUploadSessionCommandSchema.parse({
      schemaVersion: 1,
      idempotencyKey: generateIdempotencyKey('upload_sess'),
      data,
    });
    const callable = httpsCallable(this.functions, 'createVehicleUploadSession');
    const res = await callable(command);
    return parseCallableResult(createVehicleUploadSessionResultSchema, res.data, 'createVehicleUploadSession');
  }

  async uploadVehiclePhoto(storagePath: string, fileUri: string, contentType: string): Promise<void> {
    const storageInstance = getStorage();
    const fileRef = ref(storageInstance, storagePath);
    await putFile(fileRef, fileUri, { contentType });
  }

  async finalizeImage(data: FinalizeVehicleImageData): Promise<FinalizeVehicleImageResult> {
    const command: FinalizeVehicleImageCommand = finalizeVehicleImageCommandSchema.parse({
      schemaVersion: 1,
      idempotencyKey: generateIdempotencyKey('finalize_img'),
      data,
    });
    const callable = httpsCallable(this.functions, 'finalizeVehicleImage');
    const res = await callable(command);
    return parseCallableResult(finalizeVehicleImageResultSchema, res.data, 'finalizeVehicleImage');
  }

  async submitForReview(data: SubmitVehicleForReviewData): Promise<SubmitVehicleForReviewResult> {
    const command: SubmitVehicleForReviewCommand = submitVehicleForReviewCommandSchema.parse({
      schemaVersion: 1,
      idempotencyKey: generateIdempotencyKey('submit_veh'),
      data,
    });
    const callable = httpsCallable(this.functions, 'submitVehicleForReview');
    const res = await callable(command);
    return parseCallableResult(submitVehicleForReviewResultSchema, res.data, 'submitVehicleForReview');
  }

  async setVisibility(data: SetVehicleVisibilityData): Promise<SetVehicleVisibilityResult> {
    const command: SetVehicleVisibilityCommand = setVehicleVisibilityCommandSchema.parse({
      schemaVersion: 1,
      idempotencyKey: generateIdempotencyKey('visibility'),
      data,
    });
    const callable = httpsCallable(this.functions, 'setVehicleVisibility');
    const res = await callable(command);
    return parseCallableResult(setVehicleVisibilityResultSchema, res.data, 'setVehicleVisibility');
  }
}

export function createOwnerFleetGateway(): OwnerFleetGateway {
  return new NativeOwnerFleetGateway();
}
