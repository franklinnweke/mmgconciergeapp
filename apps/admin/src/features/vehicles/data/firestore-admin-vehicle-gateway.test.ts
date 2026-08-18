import type { Firestore } from 'firebase-admin/firestore';
import type { Storage } from 'firebase-admin/storage';
import { describe, expect, it, vi } from 'vitest';

import { FirestoreAdminVehicleGateway } from './firestore-admin-vehicle-gateway';

vi.mock('server-only', () => ({}));
vi.mock('@/features/auth/server/firebase-admin', () => ({
  getAdminFirestore: vi.fn(),
  getAdminStorage: vi.fn(),
}));

function mockFirestore(options?: {
  vehicleDoc?: Record<string, unknown> | null;
  privateDoc?: Record<string, unknown> | null;
  imagesDocs?: Array<{ id: string; data: Record<string, unknown> }>;
  vehicleList?: Array<{ id: string; data: Record<string, unknown> }>;
}) {
  const getVehicleList = options?.vehicleList ?? [];
  const vehicleDoc = options?.vehicleDoc;
  const privateDoc = options?.privateDoc;
  const imagesDocs = options?.imagesDocs ?? [];

  const mockQuery = {
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnValue({
      get: vi.fn().mockResolvedValue({
        docs: getVehicleList.map((item) => ({
          id: item.id,
          data: () => item.data,
        })),
      }),
    }),
    startAfter: vi.fn().mockReturnThis(),
  };

  const mockFirestoreInstance = {
    collection: vi.fn((path: string) => {
      if (path === 'vehicles') {
        return {
          ...mockQuery,
          doc: vi.fn((id: string) => ({
            get: vi.fn().mockResolvedValue(
              vehicleDoc !== undefined
                ? {
                    exists: vehicleDoc !== null,
                    id,
                    data: () => vehicleDoc,
                  }
                : {
                    exists: false,
                    id,
                    data: () => null,
                  },
            ),
          })),
        };
      }
      if (path === 'vehiclePrivate') {
        return {
          doc: vi.fn((id: string) => ({
            get: vi.fn().mockResolvedValue(
              privateDoc !== undefined
                ? {
                    exists: privateDoc !== null,
                    id,
                    data: () => privateDoc,
                  }
                : {
                    exists: false,
                    id,
                    data: () => null,
                  },
            ),
          })),
        };
      }
      if (path.startsWith('vehicles/') && path.endsWith('/images')) {
        return {
          orderBy: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({
              docs: imagesDocs.map((img) => ({
                id: img.id,
                data: () => img.data,
              })),
            }),
          }),
        };
      }
      if (path === 'adminAuditLogs') {
        return {
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ docs: [] }),
          }),
        };
      }
      if (path === 'ownerProfiles') {
        return {
          doc: vi.fn((id: string) => ({
            get: vi.fn().mockResolvedValue({
              exists: true,
              id,
              data: () => ({ legalName: 'Chief Tunde Adeleke' }),
            }),
          })),
        };
      }
      return mockQuery;
    }),
  } as unknown as Firestore;

  return mockFirestoreInstance;
}

function mockStorage() {
  return {
    bucket: vi.fn().mockReturnValue({
      file: vi.fn((path: string) => ({
        getSignedUrl: vi.fn().mockResolvedValue([`https://signed-url.test/${path}`]),
      })),
    }),
  } as unknown as Storage;
}

describe('FirestoreAdminVehicleGateway', () => {
  it('fails closed and returns an empty list without leaking fixtures when live query returns 0 docs', async () => {
    const firestore = mockFirestore({ vehicleList: [] });
    const storage = mockStorage();
    const gateway = new FirestoreAdminVehicleGateway(firestore, storage);

    const result = await gateway.listVehicles();
    expect(result).toEqual({
      items: [],
      hasMore: false,
      nextCursor: null,
    });
  });

  it('maps real flat vehicle fields accurately in listVehicles', async () => {
    const firestore = mockFirestore({
      vehicleList: [
        {
          id: 'veh-001',
          data: {
            ownerId: 'owner-001',
            displayName: '2023 Mercedes G63 AMG',
            make: 'Mercedes-Benz',
            model: 'G63 AMG',
            year: 2023,
            category: 'luxury_suv',
            seats: 5,
            ownerDailyRateKobo: 45_000_000,
            areaLabel: 'Banana Island',
            imageCount: 8,
            moderationStatus: 'pending_review',
            version: 1,
            primaryImagePath: 'private/vehicle-uploads/owner-001/veh-001/img-01/variants/card',
            createdAt: '2026-08-16T12:00:00.000Z',
            submittedAt: '2026-08-16T12:30:00.000Z',
          },
        },
      ],
    });
    const storage = mockStorage();
    const gateway = new FirestoreAdminVehicleGateway(firestore, storage);

    const result = await gateway.listVehicles();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      vehicleId: 'veh-001',
      ownerId: 'owner-001',
      make: 'Mercedes-Benz',
      model: 'G63 AMG',
      year: 2023,
      category: 'luxury_suv',
      seats: 5,
      dailyRateKobo: 45_000_000,
      areaLabel: 'Banana Island',
      imageCount: 8,
      moderationStatus: 'pending_review',
      version: 1,
      thumbnailUrl: 'https://signed-url.test/private/vehicle-uploads/owner-001/veh-001/img-01/variants/card',
    });
  });

  it('returns null when vehicle document is missing (fail-closed)', async () => {
    const firestore = mockFirestore({ vehicleDoc: null });
    const storage = mockStorage();
    const gateway = new FirestoreAdminVehicleGateway(firestore, storage);

    const detail = await gateway.getVehicleDetail('non-existent-veh');
    expect(detail).toBeNull();
  });

  it('joins flat vehicle with vehiclePrivate plate and images subcollection in getVehicleDetail', async () => {
    const firestore = mockFirestore({
      vehicleDoc: {
        ownerId: 'owner-001',
        displayName: '2024 Toyota Land Cruiser Prado',
        make: 'Toyota',
        model: 'Land Cruiser Prado',
        year: 2024,
        category: 'executive_suv',
        seats: 7,
        ownerDailyRateKobo: 25_000_000,
        areaLabel: 'Ikoyi',
        imageCount: 2,
        moderationStatus: 'pending_review',
        version: 2,
        description: 'Chauffeured Prado 250 in Ikoyi.',
        transmission: 'Automatic',
        colour: 'Black',
        primaryImagePath: 'private/vehicle-uploads/owner-001/veh-001/img-1/variants/card',
        createdAt: '2026-08-16T10:00:00.000Z',
        submittedAt: '2026-08-16T10:15:00.000Z',
      },
      privateDoc: {
        plate: 'LAG123XY',
        baseAddress: { line1: '12 Bourdillon Rd, Ikoyi' },
      },
      imagesDocs: [
        {
          id: 'img-1',
          data: {
            order: 0,
            originalFileName: 'front.jpg',
            byteSize: 1500000,
            contentType: 'image/jpeg',
            variantPaths: { card: 'private/vehicle-uploads/owner-001/veh-001/img-1/variants/card' },
          },
        },
        {
          id: 'img-2',
          data: {
            order: 1,
            originalFileName: 'cabin.jpg',
            byteSize: 1200000,
            contentType: 'image/jpeg',
            variantPaths: { card: 'private/vehicle-uploads/owner-001/veh-001/img-2/variants/card' },
          },
        },
      ],
    });
    const storage = mockStorage();
    const gateway = new FirestoreAdminVehicleGateway(firestore, storage);

    const detail = await gateway.getVehicleDetail('veh-001');
    expect(detail).not.toBeNull();
    expect(detail!).toMatchObject({
      vehicleId: 'veh-001',
      ownerId: 'owner-001',
      ownerLegalName: 'Chief Tunde Adeleke',
      make: 'Toyota',
      model: 'Land Cruiser Prado',
      year: 2024,
      seats: 7,
      plateMasked: '***XY', // Masked via canonical @mmg/domain maskNigerianPlate
      images: [
        {
          uploadId: 'img-1',
          originalFileName: 'front.jpg',
          previewUrl: 'https://signed-url.test/private/vehicle-uploads/owner-001/veh-001/img-1/variants/card',
          isPrimary: true,
        },
        {
          uploadId: 'img-2',
          originalFileName: 'cabin.jpg',
          previewUrl: 'https://signed-url.test/private/vehicle-uploads/owner-001/veh-001/img-2/variants/card',
          isPrimary: false,
        },
      ],
    });
  });

  it('marks auditTrailUnavailable when adminAuditLogs query fails', async () => {
    const brokenFirestore = {
      collection: vi.fn((path: string) => {
        if (path === 'vehicles') {
          return {
            doc: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({
                exists: true,
                id: 'veh-broken-audit',
                data: () => ({ ownerId: 'owner-1', moderationStatus: 'pending_review' }),
              }),
            }),
          };
        }
        if (path === 'vehiclePrivate') {
          return {
            doc: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({ exists: false }),
            }),
          };
        }
        if (path.includes('/images')) {
          return {
            orderBy: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({ docs: [] }),
            }),
          };
        }
        if (path === 'adminAuditLogs') {
          return {
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnValue({
              get: vi.fn().mockRejectedValue(new Error('Missing composite index')),
            }),
          };
        }
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ exists: false }),
          }),
        };
      }),
    } as unknown as Firestore;

    const storage = mockStorage();
    const gateway = new FirestoreAdminVehicleGateway(brokenFirestore, storage);

    const detail = await gateway.getVehicleDetail('veh-broken-audit');
    expect(detail).not.toBeNull();
    expect(detail!.auditTrailUnavailable).toBe(true);
  });
});
