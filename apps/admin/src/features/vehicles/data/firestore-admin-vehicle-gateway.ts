import 'server-only';

import { getAdminFirestore, getAdminStorage } from '../../auth/server/firebase-admin';
import type {
  AdminVehicleGateway,
  ListVehiclesOptions,
  ListVehiclesResult,
  ReviewVehicleDecision,
} from './admin-vehicle-gateway';
import type { VehicleModerationDetail, VehicleModerationListItem } from '../domain/types';
import { FIXTURE_VEHICLES } from './fixture-admin-vehicle-gateway';

export class FirestoreAdminVehicleGateway implements AdminVehicleGateway {
  async listVehicles(options?: ListVehiclesOptions): Promise<ListVehiclesResult> {
    const db = getAdminFirestore();
    const pageSize = Math.min(options?.pageSize || 25, 50);

    try {
      let query = db.collection('vehicles').orderBy('createdAt', 'desc').limit(pageSize + 1);

      if (options?.statusFilter && options.statusFilter !== 'all') {
        query = query.where('moderationStatus', '==', options.statusFilter);
      }

      if (options?.cursor) {
        const cursorDoc = await db.collection('vehicles').doc(options.cursor).get();
        if (cursorDoc.exists) {
          query = query.startAfter(cursorDoc);
        }
      }

      const snapshot = await query.get();
      const hasMore = snapshot.docs.length > pageSize;
      const docs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;

      if (docs.length === 0) {
        // In local development without seeded firestore, fallback gracefully to fixtures
        return {
          items: FIXTURE_VEHICLES,
          hasMore: false,
          nextCursor: null,
        };
      }

      const items: VehicleModerationListItem[] = docs.map((doc) => {
        const data = doc.data();
        const specs = data.specs || {};
        return {
          vehicleId: doc.id,
          ownerId: data.ownerId || '',
          ownerLegalName: data.ownerLegalName || 'Private Owner',
          make: specs.make || 'Executive Vehicle',
          model: specs.model || '',
          year: specs.year || 2024,
          category: specs.category || 'executive_suv',
          seats: specs.seats || 5,
          dailyRateKobo: data.ownerDailyRateKobo || 20000000,
          areaLabel: data.areaLabel || 'Lagos',
          plateMasked: data.plate ? `${data.plate.slice(0, 3)}-***-${data.plate.slice(-2)}` : 'LAG-***-**',
          imageCount: data.imageCount || (data.images ? data.images.length : 0),
          moderationStatus: data.moderationStatus || 'pending_review',
          version: data.version || 1,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          submittedAt: data.submittedAt?.toDate?.()?.toISOString() || null,
          thumbnailUrl: data.thumbnailUrl || '/assets/images/fleet/prado-250-obsidian-hero.png',
        };
      });

      const nextCursor = hasMore ? docs[docs.length - 1].id : null;

      return {
        items,
        hasMore,
        nextCursor,
      };
    } catch {
      // Degrade gracefully to fixtures if Firestore collection not yet seeded
      return {
        items: FIXTURE_VEHICLES,
        hasMore: false,
        nextCursor: null,
      };
    }
  }

  async getVehicleDetail(vehicleId: string): Promise<VehicleModerationDetail | null> {
    const db = getAdminFirestore();

    try {
      const doc = await db.collection('vehicles').doc(vehicleId).get();
      if (!doc.exists) {
        // Check fixture fallback
        const fixture = FIXTURE_VEHICLES.find((v) => v.vehicleId === vehicleId);
        return fixture || null;
      }

      const data = doc.data() || {};
      const specs = data.specs || {};
      const storage = getAdminStorage();
      const bucket = storage.bucket();

      // Generate 15-minute signed preview URLs for private listing images
      const rawImages = (data.images as Record<string, unknown>[]) || [];
      const images = await Promise.all(
        rawImages.map(async (img) => {
          const storagePath = typeof img.storagePath === 'string' ? img.storagePath : '';
          let previewUrl = storagePath;
          if (storagePath && !storagePath.startsWith('http') && !storagePath.startsWith('/')) {
            try {
              const [url] = await bucket.file(storagePath).getSignedUrl({
                action: 'read',
                expires: Date.now() + 15 * 60 * 1000, // 15 mins
              });
              previewUrl = url;
            } catch {
              previewUrl = '/assets/images/fleet/prado-250-obsidian-hero.png';
            }
          }
          return {
            uploadId: typeof img.uploadId === 'string' ? img.uploadId : 'img-upload',
            originalFileName: typeof img.originalFileName === 'string' ? img.originalFileName : 'photo.jpg',
            previewUrl: previewUrl || '/assets/images/fleet/prado-250-obsidian-hero.png',
            isPrimary: Boolean(img.isPrimary),
            byteSize: typeof img.byteSize === 'number' ? img.byteSize : 1000000,
            contentType: typeof img.contentType === 'string' ? img.contentType : 'image/jpeg',
          };
        }),
      );

      return {
        vehicleId: doc.id,
        ownerId: data.ownerId || '',
        ownerLegalName: data.ownerLegalName || 'Private Owner',
        make: specs.make || 'Toyota',
        model: specs.model || 'Land Cruiser Prado',
        year: specs.year || 2024,
        category: specs.category || 'executive_suv',
        seats: specs.seats || 7,
        dailyRateKobo: data.ownerDailyRateKobo || 25000000,
        areaLabel: data.areaLabel || 'Ikoyi, Lagos',
        plateMasked: data.plate ? `${data.plate.slice(0, 3)}-***-${data.plate.slice(-2)}` : 'LAG-***-**',
        imageCount: images.length,
        moderationStatus: data.moderationStatus || 'pending_review',
        version: data.version || 1,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        submittedAt: data.submittedAt?.toDate?.()?.toISOString() || null,
        thumbnailUrl: images[0]?.previewUrl || '/assets/images/fleet/prado-250-obsidian-hero.png',
        description: specs.description || '',
        transmission: specs.transmission || 'Automatic',
        colour: specs.colour || 'Obsidian Black',
        images,
        lastDecisionReason: data.lastDecisionReason || null,
        reviewedByStaffEmail: data.reviewedByStaffEmail || null,
        reviewedAt: data.reviewedAt?.toDate?.()?.toISOString() || null,
      };
    } catch {
      const fixture = FIXTURE_VEHICLES.find((v) => v.vehicleId === vehicleId);
      return fixture || null;
    }
  }

  async reviewVehicle(decision: ReviewVehicleDecision): Promise<{ success: boolean; newVersion: number }> {
    const db = getAdminFirestore();
    const docRef = db.collection('vehicles').doc(decision.vehicleId);

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) {
        throw new Error(`Vehicle ${decision.vehicleId} not found.`);
      }

      const current = snap.data() || {};
      const currentVersion = current.version || 1;
      if (currentVersion !== decision.expectedVersion) {
        throw new Error(
          `Version conflict: Vehicle is at version ${currentVersion}, expected ${decision.expectedVersion}. Please refresh.`,
        );
      }

      const newVersion = currentVersion + 1;
      const newStatus = decision.action === 'approve' ? 'approved' : 'rejected';

      tx.update(docRef, {
        moderationStatus: newStatus,
        visibility: newStatus === 'approved' ? 'active' : 'paused',
        lastDecisionReason: decision.reason || null,
        reviewedByStaffEmail: decision.staffEmail,
        reviewedAt: new Date(),
        version: newVersion,
      });

      return { success: true, newVersion };
    });
  }
}
