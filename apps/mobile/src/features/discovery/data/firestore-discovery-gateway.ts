import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  query,
  where,
  type DocumentSnapshot,
} from '@react-native-firebase/firestore';
import {
  DiscoveryGateway,
  renterVisibleVehicleToSummary,
  type RenterVisibleVehicle,
  type VehicleSearchCriteria,
  type VehicleSummary,
} from '@mmg/contracts';
import {
  haversineDistanceKm,
  rankVehiclesByDiscoveryScore,
} from '@mmg/domain';

const DEFAULT_LAGOS_ORIGIN = { lat: 6.4281, lng: 3.4219 };
const MAX_DISCOVERY_FETCH_LIMIT = 30;

export class NativeFirestoreDiscoveryGateway implements DiscoveryGateway {
  private mapDocToVehicleSummary(
    docSnap: DocumentSnapshot,
    originLat?: number,
    originLng?: number,
  ): VehicleSummary | null {
    if (!docSnap.exists) return null;
    const d = docSnap.data();
    if (!d) return null;

    // Discoverability invariant check on client
    if (!d.discoverable || d.moderationStatus !== 'approved' || d.visibility !== 'active') {
      return null;
    }

    // Strict validation: Drop row if any required field is missing or invalid (never fabricate)
    if (typeof d.make !== 'string' || !d.make.trim()) return null;
    if (typeof d.model !== 'string' || !d.model.trim()) return null;
    if (typeof d.year !== 'number' || d.year < 2000) return null;
    if (typeof d.seats !== 'number' || d.seats < 1) return null;
    if (typeof d.ownerDailyRateKobo !== 'number' || d.ownerDailyRateKobo <= 0) return null;
    if (typeof d.areaLabel !== 'string' || !d.areaLabel.trim()) return null;
    if (typeof d.approxLatitude !== 'number' || typeof d.approxLongitude !== 'number') return null;

    if (
      d.category !== 'executive_sedan' &&
      d.category !== 'executive_suv' &&
      d.category !== 'luxury_van' &&
      d.category !== 'presidential_armored'
    ) {
      return null;
    }

    if (d.chauffeurPolicy !== 'included' || d.deliveryPolicy !== 'included') {
      return null;
    }

    const imageUrls: string[] = Array.isArray(d.imageUrls) && d.imageUrls.length > 0
      ? d.imageUrls
      : d.primaryImageUrl
        ? [d.primaryImageUrl]
        : [];

    if (imageUrls.length === 0) {
      // Must have at least one approved public image
      return null;
    }

    const approxLat = d.approxLatitude;
    const approxLng = d.approxLongitude;

    const refLat = originLat ?? DEFAULT_LAGOS_ORIGIN.lat;
    const refLng = originLng ?? DEFAULT_LAGOS_ORIGIN.lng;

    const distanceKm = haversineDistanceKm(refLat, refLng, approxLat, approxLng);

    const category = d.category;

    const renterVehicle: RenterVisibleVehicle = {
      vehicleId: docSnap.id,
      ownerId: typeof d.ownerId === 'string' ? d.ownerId : '',
      displayName: typeof d.displayName === 'string' && d.displayName.trim() ? d.displayName : `${d.make} ${d.model} ${d.year}`,
      category,
      seats: d.seats,
      areaLabel: d.areaLabel,
      approxLatitude: approxLat,
      approxLongitude: approxLng,
      ownerDailyRateKobo: d.ownerDailyRateKobo,
      chauffeurPolicy: 'included',
      deliveryPolicy: 'included',
      imageUrls,
      primaryImageUrl: imageUrls[0],
      description: typeof d.description === 'string' ? d.description : '',
      features: Array.isArray(d.features) ? d.features : [],
      year: d.year,
      make: d.make,
      model: d.model,
    };

    return renterVisibleVehicleToSummary(renterVehicle, distanceKm);
  }

  async getFeaturedVehicles(): Promise<readonly VehicleSummary[]> {
    const db = getFirestore();
    const vehiclesRef = collection(db, 'vehicles');
    const q = query(
      vehiclesRef,
      where('discoverable', '==', true),
      limit(MAX_DISCOVERY_FETCH_LIMIT),
    );
    const snap = await getDocs(q);

    const list: VehicleSummary[] = [];
    snap.forEach((docSnap) => {
      const v = this.mapDocToVehicleSummary(docSnap);
      if (v) list.push(v);
    });

    return rankVehiclesByDiscoveryScore(list);
  }

  async searchVehicles(criteria: VehicleSearchCriteria): Promise<readonly VehicleSummary[]> {
    const db = getFirestore();
    const vehiclesRef = collection(db, 'vehicles');
    const q = query(
      vehiclesRef,
      where('discoverable', '==', true),
      limit(MAX_DISCOVERY_FETCH_LIMIT),
    );
    const snap = await getDocs(q);

    let list: VehicleSummary[] = [];
    const originLat = criteria.originLat;
    const originLng = criteria.originLng;

    snap.forEach((docSnap) => {
      const v = this.mapDocToVehicleSummary(docSnap, originLat, originLng);
      if (v) list.push(v);
    });

    // Filter in memory for criteria
    const queryStr = criteria.query?.trim().toLowerCase();
    list = list.filter((v) => {
      if (queryStr) {
        const match =
          v.displayName.toLowerCase().includes(queryStr) ||
          v.areaLabel.toLowerCase().includes(queryStr) ||
          (v.make && v.make.toLowerCase().includes(queryStr)) ||
          (v.model && v.model.toLowerCase().includes(queryStr));
        if (!match) return false;
      }

      if (criteria.category && v.category !== criteria.category) {
        return false;
      }

      if (criteria.areaLabel && v.areaLabel.toLowerCase() !== criteria.areaLabel.toLowerCase()) {
        return false;
      }

      if (criteria.minSeats && v.seats < criteria.minSeats) {
        return false;
      }

      if (criteria.minDailyRateKobo && v.dailyRateKobo < criteria.minDailyRateKobo) {
        return false;
      }

      if (criteria.maxDailyRateKobo && v.dailyRateKobo > criteria.maxDailyRateKobo) {
        return false;
      }

      if (criteria.radiusKm && v.distanceKm > criteria.radiusKm) {
        return false;
      }

      return true;
    });

    return rankVehiclesByDiscoveryScore(list);
  }

  async getVehicleById(vehicleId: string): Promise<VehicleSummary | null> {
    const db = getFirestore();
    const docRef = doc(db, 'vehicles', vehicleId);
    const snap = await getDoc(docRef);
    if (!snap.exists) return null;
    return this.mapDocToVehicleSummary(snap);
  }
}

export function createDiscoveryGateway(): DiscoveryGateway {
  return new NativeFirestoreDiscoveryGateway();
}
