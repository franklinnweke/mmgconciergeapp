import {
  type RenterVisibleVehicle,
  type VehicleCategory,
} from '@mmg/contracts';
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

export type SearchVehiclesCriteria = {
  query?: string;
  category?: VehicleCategory;
  areaLabel?: string;
  minSeats?: number;
  minPriceKobo?: number;
  maxPriceKobo?: number;
  originLat?: number;
  originLng?: number;
  radiusKm?: number;
  startDate?: string;
  endDate?: string;
};

export type SearchVehiclesResult = {
  vehicles: (RenterVisibleVehicle & { distanceKm: number })[];
  totalMatches: number;
};

export interface DiscoveryVehicleSource {
  listDiscoverable(): Promise<Array<{ vehicle: VehicleRecord; images: VehicleImageRecord[] }>>;
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

    for (const doc of snap.docs) {
      const vehicle = doc.data() as VehicleRecord;
      const imagesSnap = await this.firestore
        .collection('vehicles')
        .doc(doc.id)
        .collection('images')
        .where('status', '==', 'approved')
        .get();

      const images = imagesSnap.docs.map((d) => d.data() as VehicleImageRecord);
      results.push({ vehicle, images });
    }

    return results;
  }
}

export async function searchVehiclesService(
  criteria: SearchVehiclesCriteria,
  source: DiscoveryVehicleSource,
  bucketName: string,
): Promise<SearchVehiclesResult> {
  const publicObjectUrl = googleCloudStoragePublicUrl(bucketName);
  const items = await source.listDiscoverable();

  const originLat = criteria.originLat ?? 6.4281; // Default to central VI
  const originLng = criteria.originLng ?? 3.4219;

  const matches: (RenterVisibleVehicle & { distanceKm: number })[] = [];

  for (const item of items) {
    const renterVehicle = toRenterVisibleVehicle(
      item.vehicle,
      item.images,
      publicObjectUrl,
    );

    if (!renterVehicle) continue;

    const distanceKm = haversineDistanceKm(
      originLat,
      originLng,
      renterVehicle.approxLatitude,
      renterVehicle.approxLongitude,
    );

    // 2. Apply criteria filters
    if (criteria.category && renterVehicle.category !== criteria.category) {
      continue;
    }

    if (criteria.minSeats && renterVehicle.seats < criteria.minSeats) {
      continue;
    }

    if (criteria.minPriceKobo && renterVehicle.ownerDailyRateKobo < criteria.minPriceKobo) {
      continue;
    }

    if (criteria.maxPriceKobo && renterVehicle.ownerDailyRateKobo > criteria.maxPriceKobo) {
      continue;
    }

    if (criteria.areaLabel && renterVehicle.areaLabel.toLowerCase() !== criteria.areaLabel.toLowerCase()) {
      continue;
    }

    if (criteria.radiusKm && distanceKm > criteria.radiusKm) {
      continue;
    }

    if (criteria.query) {
      const q = criteria.query.trim().toLowerCase();
      const textMatch =
        renterVehicle.displayName.toLowerCase().includes(q) ||
        renterVehicle.make.toLowerCase().includes(q) ||
        renterVehicle.model.toLowerCase().includes(q) ||
        renterVehicle.areaLabel.toLowerCase().includes(q);
      if (!textMatch) continue;
    }

    matches.push({
      ...renterVehicle,
      distanceKm,
    });
  }

  // 3. Composite distance + price ranking
  const ranked = rankVehiclesByDiscoveryScore(
    matches.map((m) => ({ ...m, dailyRateKobo: m.ownerDailyRateKobo })),
  );

  return {
    vehicles: ranked,
    totalMatches: ranked.length,
  };
}
