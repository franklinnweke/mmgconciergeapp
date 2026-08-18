import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';

import { FirestoreBookingIntentRepository } from './firestore-booking-intent-repository.js';

describe('FirestoreBookingIntentRepository vehicle schema compatibility', () => {
  it('correctly parses real VehicleRecord shapes with discoverable invariant', async () => {
    const mockFirestore = {
      runTransaction: vi.fn(async (work) => {
        const mockTransaction = {
          get: vi.fn((docRef: { path: string }) => {
            if (docRef.path === 'vehicles/veh-live-prado') {
              return Promise.resolve({
                exists: true,
                id: 'veh-live-prado',
                data: () => ({
                  ownerId: 'owner-lagos-1',
                  displayName: '2024 Toyota Land Cruiser Prado 250',
                  category: 'executive_suv',
                  areaLabel: 'Ikoyi',
                  ownerDailyRateKobo: 25_000_000,
                  moderationStatus: 'approved',
                  visibility: 'active',
                  discoverable: true,
                  primaryImagePath: 'https://storage.googleapis.com/mmg-concierge/public/vehicles/veh-live-prado/approved/img-1-card.jpg',
                  version: 3,
                }),
              });
            }
            return Promise.resolve({ exists: false });
          }),
        } as unknown as Transaction;
        return work(mockTransaction);
      }),
      doc: (path: string) => ({ path }),
    } as unknown as Firestore;

    const repository = new FirestoreBookingIntentRepository(mockFirestore);
    const vehicle = await repository.runTransaction((tx) => tx.getVehicle('veh-live-prado'));

    expect(vehicle).not.toBeNull();
    expect(vehicle).toEqual({
      id: 'veh-live-prado',
      ownerId: 'owner-lagos-1',
      active: true,
      ownerDailyRateKobo: 25_000_000,
      vehicleSnapshot: {
        displayName: '2024 Toyota Land Cruiser Prado 250',
        areaLabel: 'Ikoyi',
        categoryLabel: 'Executive SUV',
        imageUrl: 'https://storage.googleapis.com/mmg-concierge/public/vehicles/veh-live-prado/approved/img-1-card.jpg',
      },
    });
  });

  it('marks inactive if vehicle is approved but visibility is paused or discoverable is false', async () => {
    const mockFirestore = {
      runTransaction: vi.fn(async (work) => {
        const mockTransaction = {
          get: vi.fn((docRef: { path: string }) => {
            if (docRef.path === 'vehicles/veh-paused') {
              return Promise.resolve({
                exists: true,
                id: 'veh-paused',
                data: () => ({
                  ownerId: 'owner-lagos-1',
                  displayName: '2024 Toyota Prado',
                  category: 'executive_suv',
                  areaLabel: 'Ikoyi',
                  ownerDailyRateKobo: 25_000_000,
                  moderationStatus: 'approved',
                  visibility: 'paused',
                  discoverable: false,
                }),
              });
            }
            return Promise.resolve({ exists: false });
          }),
        } as unknown as Transaction;
        return work(mockTransaction);
      }),
      doc: (path: string) => ({ path }),
    } as unknown as Firestore;

    const repository = new FirestoreBookingIntentRepository(mockFirestore);
    const vehicle = await repository.runTransaction((tx) => tx.getVehicle('veh-paused'));

    expect(vehicle).not.toBeNull();
    expect(vehicle!.active).toBe(false);
  });

  it('correctly maintains backward compatibility with legacy fixture vehicles', async () => {
    const mockFirestore = {
      runTransaction: vi.fn(async (work) => {
        const mockTransaction = {
          get: vi.fn((docRef: { path: string }) => {
            if (docRef.path === 'vehicles/veh-fixture') {
              return Promise.resolve({
                exists: true,
                id: 'veh-fixture',
                data: () => ({
                  ownerId: 'owner-1',
                  active: true,
                  ownerDailyRateKobo: 38_500_000,
                  displayName: 'Pearl Executive SUV',
                  areaLabel: 'Victoria Island',
                  categoryLabel: 'Executive SUV',
                  imageKey: 'pearl-suv',
                }),
              });
            }
            return Promise.resolve({ exists: false });
          }),
        } as unknown as Transaction;
        return work(mockTransaction);
      }),
      doc: (path: string) => ({ path }),
    } as unknown as Firestore;

    const repository = new FirestoreBookingIntentRepository(mockFirestore);
    const vehicle = await repository.runTransaction((tx) => tx.getVehicle('veh-fixture'));

    expect(vehicle).not.toBeNull();
    expect(vehicle!.active).toBe(true);
    expect(vehicle!.vehicleSnapshot.imageKey).toBe('pearl-suv');
  });
});
