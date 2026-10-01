import { maskNigerianPlate } from '@mmg/domain';
import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import type { Storage } from 'firebase-admin/storage';

import { getAdminFirestore, getAdminStorage } from '@/features/auth/server/firebase-admin';
import type {
  AdminVehicleGateway,
  ListVehiclesOptions,
  ListVehiclesResult,
} from './admin-vehicle-gateway';
import type {
  VehicleImageDetail,
  VehicleModerationDetail,
  VehicleModerationListItem,
} from '../domain/types';

function toIsoString(value: unknown): string {
  if (value === null || value === undefined) return new Date().toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const withToDate = value as { toDate?: () => Date };
    if (typeof withToDate.toDate === 'function') {
      try {
        return withToDate.toDate().toISOString();
      } catch {
        return new Date().toISOString();
      }
    }
  }
  return new Date().toISOString();
}

function toNullableIsoString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return toIsoString(value);
}

export class FirestoreAdminVehicleGateway implements AdminVehicleGateway {
  private firestore: Firestore;
  private storage: Storage;

  constructor(firestore?: Firestore, storage?: Storage) {
    this.firestore = firestore || getAdminFirestore();
    this.storage = storage || getAdminStorage();
  }

  async mintSignedImageUrl(storagePath: string): Promise<string | null> {
    if (!storagePath) return null;
    if (storagePath.startsWith('http://') || storagePath.startsWith('https://') || storagePath.startsWith('/')) {
      return storagePath;
    }

    try {
      const bucket = this.storage.bucket();
      const file = bucket.file(storagePath);
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 60 * 60 * 1000, // 1 hour
      });
      return signedUrl;
    } catch {
      return null;
    }
  }

  async listVehicles(options?: ListVehiclesOptions): Promise<ListVehiclesResult> {
    const pageSize = Math.min(Math.max(options?.pageSize || 15, 1), 50);
    let query = this.firestore.collection('vehicles').orderBy('createdAt', 'desc');

    if (options?.statusFilter && options.statusFilter !== 'all') {
      query = this.firestore
        .collection('vehicles')
        .where('moderationStatus', '==', options.statusFilter)
        .orderBy('createdAt', 'desc');
    }

    if (options?.cursor) {
      const cursorSnap = await this.firestore.collection('vehicles').doc(options.cursor).get();
      if (cursorSnap.exists) {
        query = query.startAfter(cursorSnap);
      }
    }

    const snapshot = await query.limit(pageSize + 1).get();
    const docs = snapshot.docs;
    const hasMore = docs.length > pageSize;
    const resultDocs = hasMore ? docs.slice(0, pageSize) : docs;

    if (resultDocs.length === 0) {
      return {
        items: [],
        hasMore: false,
        nextCursor: null,
      };
    }

    const items: VehicleModerationListItem[] = await Promise.all(
      resultDocs.map(async (doc: QueryDocumentSnapshot) => {
        const data = doc.data();

        let thumbnailUrl = '';
        if (data.primaryImagePath) {
          const signed = await this.mintSignedImageUrl(data.primaryImagePath);
          if (signed) thumbnailUrl = signed;
        }

        return {
          vehicleId: doc.id,
          ownerId: typeof data.ownerId === 'string' ? data.ownerId : '',
          ownerLegalName: typeof data.ownerLegalName === 'string' ? data.ownerLegalName : 'Private Owner',
          make: typeof data.make === 'string' ? data.make : 'Unspecified',
          model: typeof data.model === 'string' ? data.model : '',
          year: typeof data.year === 'number' ? data.year : 0,
          category: data.category || 'executive_suv',
          seats: typeof data.seats === 'number' ? data.seats : 0,
          dailyRateKobo: typeof data.ownerDailyRateKobo === 'number' ? data.ownerDailyRateKobo : 0,
          areaLabel: typeof data.areaLabel === 'string' ? data.areaLabel : 'Lagos',
          plateMasked: 'Plate In Private Record',
          imageCount: typeof data.imageCount === 'number' ? data.imageCount : 0,
          moderationStatus: data.moderationStatus || 'draft',
          visibility: data.visibility === 'active' || data.visibility === 'deleted' ? data.visibility : 'paused',
          discoverable: typeof data.discoverable === 'boolean' ? data.discoverable : false,
          version: typeof data.version === 'number' ? data.version : 1,
          createdAt: toIsoString(data.createdAt),
          submittedAt: toNullableIsoString(data.submittedAt),
          thumbnailUrl,
        };
      }),
    );

    const nextCursor = hasMore ? resultDocs[resultDocs.length - 1].id : null;

    return {
      items,
      hasMore,
      nextCursor,
    };
  }

  async getVehicleDetail(vehicleId: string): Promise<VehicleModerationDetail | null> {
    if (!vehicleId) return null;

    const [docSnap, privateSnap, imagesSnap] = await Promise.all([
      this.firestore.collection('vehicles').doc(vehicleId).get(),
      this.firestore.collection('vehiclePrivate').doc(vehicleId).get(),
      this.firestore.collection(`vehicles/${vehicleId}/images`).orderBy('order', 'asc').get(),
    ]);

    if (!docSnap.exists) {
      return null;
    }

    const data = docSnap.data()!;
    const privateData = privateSnap.exists ? privateSnap.data() : null;

    // Fetch owner legal name if not on vehicle doc
    let ownerLegalName = typeof data.ownerLegalName === 'string' ? data.ownerLegalName : '';
    if (!ownerLegalName && data.ownerId) {
      try {
        const ownerSnap = await this.firestore.collection('ownerProfiles').doc(data.ownerId).get();
        if (ownerSnap.exists) {
          ownerLegalName = ownerSnap.data()?.legalName || ownerSnap.data()?.displayName || '';
        }
      } catch {
        // Non-blocking
      }
    }
    if (!ownerLegalName) ownerLegalName = 'Private Owner';

    // Mask registration plate using canonical domain helper
    let plateMasked = 'Unspecified';
    if (privateData && typeof privateData.plate === 'string' && privateData.plate.trim()) {
      try {
        plateMasked = maskNigerianPlate(privateData.plate);
      } catch {
        plateMasked = 'Invalid Plate Format';
      }
    }

    // Resolve images
    const images: VehicleImageDetail[] = await Promise.all(
      imagesSnap.docs.map(async (imgDoc) => {
        const img = imgDoc.data();
        const primaryPath = img.variantPaths?.card || img.variantPaths?.thumb || img.variantPaths?.detail;
        const previewUrl = primaryPath ? await this.mintSignedImageUrl(primaryPath) : null;

        return {
          uploadId: imgDoc.id,
          originalFileName: typeof img.originalFileName === 'string' ? img.originalFileName : imgDoc.id,
          previewUrl: previewUrl || '',
          isPrimary: data.primaryImagePath === primaryPath || img.order === 0,
          byteSize: typeof img.byteSize === 'number' ? img.byteSize : 0,
          contentType: typeof img.contentType === 'string' ? img.contentType : 'image/jpeg',
        };
      }),
    );

    // Audit logs trail
    let auditTrailUnavailable = false;
    try {
      await this.firestore
        .collection('adminAuditLogs')
        .where('target', '==', vehicleId)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();
    } catch {
      auditTrailUnavailable = true;
    }

    const thumbnailUrl =
      images.find((i) => i.isPrimary)?.previewUrl ||
      images[0]?.previewUrl ||
      (data.primaryImagePath ? await this.mintSignedImageUrl(data.primaryImagePath) : '') ||
      '';

    return {
      vehicleId: docSnap.id,
      ownerId: typeof data.ownerId === 'string' ? data.ownerId : '',
      ownerLegalName,
      make: typeof data.make === 'string' ? data.make : 'Unspecified',
      model: typeof data.model === 'string' ? data.model : '',
      year: typeof data.year === 'number' ? data.year : 0,
      category: data.category || 'executive_suv',
      seats: typeof data.seats === 'number' ? data.seats : 0,
      dailyRateKobo: typeof data.ownerDailyRateKobo === 'number' ? data.ownerDailyRateKobo : 0,
      areaLabel: typeof data.areaLabel === 'string' ? data.areaLabel : 'Lagos',
      plateMasked,
      imageCount: typeof data.imageCount === 'number' ? data.imageCount : images.length,
      moderationStatus: data.moderationStatus || 'draft',
      visibility: data.visibility === 'active' || data.visibility === 'deleted' ? data.visibility : 'paused',
      discoverable: typeof data.discoverable === 'boolean' ? data.discoverable : false,
      version: typeof data.version === 'number' ? data.version : 1,
      createdAt: toIsoString(data.createdAt),
      submittedAt: toNullableIsoString(data.submittedAt),
      thumbnailUrl,
      description: typeof data.description === 'string' ? data.description : '',
      transmission: typeof data.transmission === 'string' ? data.transmission : 'Unspecified',
      colour: typeof data.colour === 'string' ? data.colour : 'Unspecified',
      images,
      lastDecisionReason: typeof data.lastDecisionReason === 'string' ? data.lastDecisionReason : null,
      reviewedByStaffEmail: typeof data.reviewedByStaffEmail === 'string' ? data.reviewedByStaffEmail : null,
      reviewedAt: toNullableIsoString(data.reviewedAt),
      auditTrailUnavailable,
    };
  }
}
