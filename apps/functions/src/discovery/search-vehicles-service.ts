import type {
  DiscoveryVehicle,
  GetVehicleDetailsResult,
  RankedDiscoveryVehicle,
  SearchVehiclesData,
  SearchVehiclesResult,
} from '@mmg/contracts/discovery';
import {
  haversineDistanceKm,
  rankVehiclesByDiscoveryScore,
} from '@mmg/domain';
import type { Firestore } from 'firebase-admin/firestore';

import {
  googleCloudStoragePublicUrl,
  toRenterVisibleVehicle,
} from '../vehicle/renter-vehicle-view.js';
import type { VehicleImageRecord, VehicleRecord } from '../vehicle/vehicle-repository.js';

export interface DiscoveryVehicleSource {
  listDiscoverable(): Promise<Array<{ vehicle: VehicleRecord; images: VehicleImageRecord[] }>>;
  getById(vehicleId: string): Promise<{ vehicle: VehicleRecord; images: VehicleImageRecord[] } | null>;
}

export class FirestoreDiscoveryVehicleSource implements DiscoveryVehicleSource {
  constructor(private readonly firestore: Firestore) {}

  async listDiscoverable(): Promise<Array<{ vehicle: VehicleRecord; images: VehicleImageRecord[] }>> {
    const snap = await this.firestore
      .collection('vehicles')
      .where('discoverable', '==', true)
      .limit(100)
      .get();

    const results: Array<{ vehicle: VehicleRecord; images: VehicleImageRecord[] }> = [];
    for (const document of snap.docs) {
      const source = await this.readSource(document.id, document.data() as VehicleRecord);
      if (source) results.push(source);
    }
    return results;
  }

  async getById(vehicleId: string): Promise<{ vehicle: VehicleRecord; images: VehicleImageRecord[] } | null> {
    const snapshot = await this.firestore.collection('vehicles').doc(vehicleId).get();
    if (!snapshot.exists) return null;
    return this.readSource(vehicleId, snapshot.data() as VehicleRecord);
  }

  private async readSource(
    vehicleId: string,
    vehicle: VehicleRecord,
  ): Promise<{ vehicle: VehicleRecord; images: VehicleImageRecord[] } | null> {
    const imagesSnap = await this.firestore
      .collection('vehicles')
      .doc(vehicleId)
      .collection('images')
      .where('status', '==', 'approved')
      .get();

    return {
      vehicle: { ...vehicle, vehicleId: vehicle.vehicleId || vehicleId },
      images: imagesSnap.docs.map((document) => document.data() as VehicleImageRecord),
    };
  }
}

function toDiscoveryVehicle(
  source: { vehicle: VehicleRecord; images: VehicleImageRecord[] },
  bucketName: string,
): DiscoveryVehicle | null {
  const renterVehicle = toRenterVisibleVehicle(
    source.vehicle,
    source.images,
    googleCloudStoragePublicUrl(bucketName),
  );
  if (!renterVehicle) return null;

  const { ownerId: _ownerId, ...discoveryVehicle } = renterVehicle;
  return discoveryVehicle;
}

export async function getVehicleDetailsService(
  vehicleId: string,
  source: DiscoveryVehicleSource,
  bucketName: string,
): Promise<GetVehicleDetailsResult> {
  const item = await source.getById(vehicleId);
  if (!item) return { vehicle: null };
  return { vehicle: toDiscoveryVehicle(item, bucketName) };
}

export async function searchVehiclesService(
  criteria: SearchVehiclesData,
  source: DiscoveryVehicleSource,
  bucketName: string,
): Promise<SearchVehiclesResult> {
  const items = await source.listDiscoverable();
  const originLat = criteria.originLat ?? 6.4281;
  const originLng = criteria.originLng ?? 3.4219;
  const matches: RankedDiscoveryVehicle[] = [];

  for (const item of items) {
    const vehicle = toDiscoveryVehicle(item, bucketName);
    if (!vehicle) continue;

    const distanceKm = haversineDistanceKm(
      originLat,
      originLng,
      vehicle.approxLatitude,
      vehicle.approxLongitude,
    );

    if (criteria.category && vehicle.category !== criteria.category) continue;
    if (criteria.minSeats && vehicle.seats < criteria.minSeats) continue;
    if (criteria.minPriceKobo && vehicle.ownerDailyRateKobo < criteria.minPriceKobo) continue;
    if (criteria.maxPriceKobo && vehicle.ownerDailyRateKobo > criteria.maxPriceKobo) continue;
    if (criteria.areaLabel && vehicle.areaLabel.toLowerCase() !== criteria.areaLabel.toLowerCase()) continue;
    if (criteria.radiusKm && distanceKm > criteria.radiusKm) continue;

    if (criteria.query) {
      const q = criteria.query.trim().toLowerCase();
      const textMatch =
        vehicle.displayName.toLowerCase().includes(q) ||
        vehicle.make.toLowerCase().includes(q) ||
        vehicle.model.toLowerCase().includes(q) ||
        vehicle.areaLabel.toLowerCase().includes(q);
      if (!textMatch) continue;
    }

    matches.push({ ...vehicle, distanceKm });
  }

  const ranked = rankVehiclesByDiscoveryScore(
    matches.map((vehicle) => ({ ...vehicle, dailyRateKobo: vehicle.ownerDailyRateKobo })),
  ).map(({ dailyRateKobo: _dailyRateKobo, ...vehicle }) => vehicle);

  return { vehicles: ranked, totalMatches: ranked.length };
}
