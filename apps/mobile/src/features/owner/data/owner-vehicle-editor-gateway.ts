import type {
  LagosAreaLabel,
  VehicleCategory,
  VehicleFeatureKey,
  VehicleFuelType,
  VehicleModerationStatus,
  VehicleTransmission,
} from '@mmg/contracts';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
} from '@react-native-firebase/firestore';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';

export type VehicleEditorSeed = {
  vehicleId: string;
  version: number;
  moderationStatus: VehicleModerationStatus;
  make: string;
  model: string;
  year: number | null;
  colour: string;
  category: VehicleCategory;
  seats: number | null;
  transmission: VehicleTransmission;
  fuelType: VehicleFuelType;
  description: string;
  features: VehicleFeatureKey[];
  ownerDailyRateKobo: number | null;
  areaLabel: LagosAreaLabel;
  streetAddress: string;
  plate: string;
  usableImageCount: number;
  rejectedImageCount: number;
};

export type UpdateVehicleDraftInput = {
  vehicleId: string;
  expectedVersion: number;
  specs?: {
    make?: string;
    model?: string;
    year?: number;
    colour?: string;
    category?: VehicleCategory;
    seats?: number;
    transmission?: VehicleTransmission;
    fuelType?: VehicleFuelType;
    description?: string;
    features?: VehicleFeatureKey[];
  };
  ownerDailyRateKobo?: number;
  areaLabel?: LagosAreaLabel;
  baseAddress?: {
    line1: string;
    areaLabel: LagosAreaLabel;
    city: 'Lagos';
    country: 'NG';
  };
  plate?: string;
  reuseRejectedImages?: boolean;
};

export type UpdateVehicleDraftResult = {
  vehicleId: string;
  moderationStatus: 'draft' | 'rejected';
  version: number;
  imageCount: number;
};

function idempotencyKey() {
  return `update_vehicle_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function requireResult(value: unknown): UpdateVehicleDraftResult {
  if (!value || typeof value !== 'object') {
    throw new Error('Vehicle update returned an invalid response.');
  }
  const root = value as Record<string, unknown>;
  const result = root.result;
  if (!result || typeof result !== 'object') {
    throw new Error('Vehicle update returned an invalid result.');
  }
  const record = result as Record<string, unknown>;
  if (
    typeof record.vehicleId !== 'string' ||
    (record.moderationStatus !== 'draft' && record.moderationStatus !== 'rejected') ||
    typeof record.version !== 'number' ||
    typeof record.imageCount !== 'number'
  ) {
    throw new Error('Vehicle update returned incomplete data.');
  }
  return {
    vehicleId: record.vehicleId,
    moderationStatus: record.moderationStatus,
    version: record.version,
    imageCount: record.imageCount,
  };
}

export class OwnerVehicleEditorGateway {
  private get firestore() {
    return getFirestore();
  }

  private get functions() {
    return getFunctions(undefined, 'africa-south1');
  }

  async getSeed(vehicleId: string): Promise<VehicleEditorSeed | null> {
    const [vehicleSnap, privateSnap, imageSnap] = await Promise.all([
      getDoc(doc(this.firestore, 'vehicles', vehicleId)),
      getDoc(doc(this.firestore, 'vehiclePrivate', vehicleId)),
      getDocs(query(collection(this.firestore, 'vehicles', vehicleId, 'images'), orderBy('order', 'asc'))),
    ]);
    if (!vehicleSnap.exists()) return null;
    const vehicle = vehicleSnap.data();
    const privateData = privateSnap.exists() ? privateSnap.data() : null;
    if (!vehicle) return null;

    let usableImageCount = 0;
    let rejectedImageCount = 0;
    imageSnap.forEach((imageDocument) => {
      const status = imageDocument.data()?.status;
      if (status === 'rejected') rejectedImageCount += 1;
      else if (status === 'processed' || status === 'approved') usableImageCount += 1;
    });

    const baseAddress = privateData?.baseAddress as Record<string, unknown> | undefined;
    return {
      vehicleId,
      version: Number(vehicle.version) || 1,
      moderationStatus: vehicle.moderationStatus as VehicleModerationStatus,
      make: typeof vehicle.make === 'string' ? vehicle.make : '',
      model: typeof vehicle.model === 'string' ? vehicle.model : '',
      year: typeof vehicle.year === 'number' ? vehicle.year : null,
      colour: typeof vehicle.colour === 'string' ? vehicle.colour : '',
      category: vehicle.category === 'executive_sedan' ? 'executive_sedan' : 'executive_suv',
      seats: typeof vehicle.seats === 'number' ? vehicle.seats : null,
      transmission: vehicle.transmission === 'manual' ? 'manual' : 'automatic',
      fuelType: vehicle.fuelType === 'diesel' || vehicle.fuelType === 'hybrid' ? vehicle.fuelType : 'petrol',
      description: typeof vehicle.description === 'string' ? vehicle.description : '',
      features: Array.isArray(vehicle.features) ? vehicle.features as VehicleFeatureKey[] : [],
      ownerDailyRateKobo: typeof vehicle.ownerDailyRateKobo === 'number' ? vehicle.ownerDailyRateKobo : null,
      areaLabel: vehicle.areaLabel as LagosAreaLabel,
      streetAddress: typeof baseAddress?.line1 === 'string' ? baseAddress.line1 : '',
      plate: typeof privateData?.plate === 'string' ? privateData.plate : '',
      usableImageCount,
      rejectedImageCount,
    };
  }

  async updateDraft(data: UpdateVehicleDraftInput): Promise<UpdateVehicleDraftResult> {
    const callable = httpsCallable(this.functions, 'updateVehicleDraft');
    const response = await callable({
      schemaVersion: 1,
      idempotencyKey: idempotencyKey(),
      data,
    });
    return requireResult(response.data);
  }
}

export function createOwnerVehicleEditorGateway() {
  return new OwnerVehicleEditorGateway();
}
