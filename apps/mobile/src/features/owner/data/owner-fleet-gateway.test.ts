import { describe, expect, it, vi } from 'vitest';

import { WebOwnerFleetGateway } from './owner-fleet-gateway.web';

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn((_functions, name) => {
    return vi.fn(async (command) => {
      if (name === 'createVehicleDraft') {
        return {
          data: {
            requestId: 'req-draft-1',
            result: {
              vehicleId: 'veh-new-1',
              moderationStatus: 'draft',
              visibility: 'paused',
              discoverable: false,
              version: 1,
            },
          },
        };
      }
      if (name === 'createVehicleUploadSession') {
        return {
          data: {
            requestId: 'req-upload-1',
            result: {
              uploadId: 'upl-img-1',
              storagePath: 'private/vehicle-uploads/owner-1/veh-new-1/upl-img-1',
              purpose: 'listing_image',
              maxBytes: 10485760,
            },
          },
        };
      }
      if (name === 'finalizeVehicleImage') {
        return {
          data: {
            requestId: 'req-fin-1',
            result: {
              imageId: 'img-1',
              order: 0,
              status: 'processed',
              width: 1920,
              height: 1080,
            },
          },
        };
      }
      if (name === 'submitVehicleForReview') {
        return {
          data: {
            requestId: 'req-submit-1',
            result: {
              vehicleId: command.data.vehicleId,
              moderationStatus: 'pending_review',
              submittedAt: '2026-08-17T12:10:00.000Z',
              version: 2,
            },
          },
        };
      }
      if (name === 'setVehicleVisibility') {
        return {
          data: {
            requestId: 'req-vis-1',
            result: {
              vehicleId: command.data.vehicleId,
              visibility: command.data.visibility,
              discoverable: command.data.visibility === 'active',
              version: command.data.expectedVersion + 1,
            },
          },
        };
      }
      return { data: { requestId: 'req-generic', result: {} } };
    });
  }),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(async () => ({
    exists: () => true,
    id: 'veh-123',
    data: () => ({
      ownerId: 'owner-lagos-1',
      displayName: '2024 Toyota Land Cruiser Prado',
      category: 'executive_suv',
      seats: 7,
      transmission: 'automatic',
      fuelType: 'petrol',
      year: 2024,
      make: 'Toyota',
      model: 'Land Cruiser Prado',
      colour: 'Obsidian Black',
      areaLabel: 'Ikoyi',
      approxLatitude: 6.45,
      approxLongitude: 3.43,
      ownerDailyRateKobo: 35_000_000,
      description: 'Pristine luxury SUV with executive chauffeur.',
      features: ['cold_ac', 'executive_chauffeur'],
      moderationStatus: 'approved',
      visibility: 'active',
      discoverable: true,
      createdAt: '2026-08-17T10:00:00.000Z',
      updatedAt: '2026-08-17T10:00:00.000Z',
      version: 2,
    }),
  })),
  getDocs: vi.fn(),
  onSnapshot: vi.fn((_q, onNext) => {
    onNext({
      forEach: (callback: any) => {
        callback({
          id: 'veh-123',
          data: () => ({
            ownerId: 'owner-lagos-1',
            displayName: '2024 Toyota Land Cruiser Prado',
            category: 'executive_suv',
            seats: 7,
            transmission: 'automatic',
            fuelType: 'petrol',
            year: 2024,
            make: 'Toyota',
            model: 'Land Cruiser Prado',
            colour: 'Obsidian Black',
            areaLabel: 'Ikoyi',
            approxLatitude: 6.45,
            approxLongitude: 3.43,
            ownerDailyRateKobo: 35_000_000,
            moderationStatus: 'approved',
            visibility: 'active',
            discoverable: true,
            createdAt: '2026-08-17T10:00:00.000Z',
            updatedAt: '2026-08-17T10:00:00.000Z',
            version: 2,
          }),
        });
      },
    });
    return () => {};
  }),
  orderBy: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}));

describe('WebOwnerFleetGateway', () => {
  const gateway = new WebOwnerFleetGateway();

  it('subscribes to owner vehicles and maps OwnerVisibleVehicle records', async () => {
    let received: any[] = [];
    const unsubscribe = gateway.subscribeOwnerVehicles(
      'owner-lagos-1',
      (vehicles) => {
        received = vehicles;
      },
      () => {},
    );

    expect(received.length).toBe(1);
    expect(received[0]).toMatchObject({
      vehicleId: 'veh-123',
      ownerId: 'owner-lagos-1',
      displayName: '2024 Toyota Land Cruiser Prado',
      category: 'executive_suv',
      moderationStatus: 'approved',
      visibility: 'active',
      discoverable: true,
      chauffeurPolicy: 'included',
      deliveryPolicy: 'included',
    });

    unsubscribe();
  });

  it('gets a single owner vehicle by ID', async () => {
    const vehicle = await gateway.getOwnerVehicle('veh-123');
    expect(vehicle).not.toBeNull();
    expect(vehicle!.displayName).toBe('2024 Toyota Land Cruiser Prado');
    expect(vehicle!.ownerDailyRateKobo).toBe(35_000_000);
  });

  it('executes createDraft and returns draft result', async () => {
    const result = await gateway.createDraft({
      specs: {
        make: 'Toyota',
        model: 'Prado 250',
        year: 2024,
        category: 'executive_suv',
        colour: 'Obsidian Black',
        seats: 7,
        transmission: 'automatic',
        fuelType: 'petrol',
        description: 'Meticulously maintained luxury SUV for executive travel.',
        features: ['climate_control', 'wifi'],
      },
      areaLabel: 'Ikoyi',
      baseAddress: {
        areaLabel: 'Ikoyi',
        line1: '12 Bourdillon Rd',
        city: 'Lagos',
        country: 'NG',
      },
      plate: 'IKJ-452XY',
      ownerDailyRateKobo: 35_000_000,
    });

    expect(result.result.vehicleId).toBe('veh-new-1');
    expect(result.result.moderationStatus).toBe('draft');
  });

  it('executes upload session creation and finalization pipeline', async () => {
    const sess = await gateway.createUploadSession({
      vehicleId: 'veh-new-1',
      purpose: 'listing_image',
      contentType: 'image/jpeg',
      byteSize: 1024 * 500,
      originalFileName: 'exterior-front.jpg',
    });
    expect(sess.result.uploadId).toBe('upl-img-1');
    expect(sess.result.storagePath).toBeDefined();

    const fin = await gateway.finalizeImage({
      vehicleId: 'veh-new-1',
      uploadId: sess.result.uploadId,
      order: 0,
    });
    expect(fin.result.status).toBe('processed');
    expect(fin.result.imageId).toBe('img-1');
  });

  it('submits vehicle for review with expected version', async () => {
    const sub = await gateway.submitForReview({
      vehicleId: 'veh-new-1',
      expectedVersion: 1,
    });
    expect(sub.result.moderationStatus).toBe('pending_review');
    expect(sub.result.version).toBe(2);
  });

  it('executes setVisibility to pause a vehicle', async () => {
    const result = await gateway.setVisibility({
      vehicleId: 'veh-123',
      expectedVersion: 2,
      visibility: 'paused',
    });

    expect(result.result.visibility).toBe('paused');
    expect(result.result.discoverable).toBe(false);
  });
});
