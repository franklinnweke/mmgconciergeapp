import type {
  AdminVehicleGateway,
  ListVehiclesOptions,
  ListVehiclesResult,
} from './admin-vehicle-gateway';
import type { VehicleModerationDetail } from '../domain/types';

export type FixtureReviewVehicleDecision = {
  vehicleId: string;
  expectedVersion: number;
  action: 'approve' | 'reject';
  reason?: string;
  staffEmail: string;
};

export const FIXTURE_VEHICLES: VehicleModerationDetail[] = [
  {
    vehicleId: 'veh-lagos-prado-250',
    ownerId: 'owner-lagos-01',
    ownerLegalName: 'Babatunde Adeleke',
    make: 'Toyota',
    model: 'Land Cruiser Prado 250',
    year: 2024,
    category: 'executive_suv',
    seats: 7,
    dailyRateKobo: 25000000,
    areaLabel: 'Ikoyi, Lagos',
    plateMasked: 'LAG-***-AB',
    imageCount: 6,
    moderationStatus: 'pending_review',
    visibility: 'paused',
    discoverable: false,
    version: 1,
    createdAt: '2026-08-16T10:00:00Z',
    submittedAt: '2026-08-16T10:30:00Z',
    thumbnailUrl: '/assets/images/fleet/prado-250-obsidian-hero.png',
    description: 'Brand new 2024 Toyota Land Cruiser Prado 250 First Edition. Black obsidian exterior, premium beige leather interior, dual-zone cold A/C, executive tinted windows, and professional chauffeur.',
    transmission: 'Automatic',
    colour: 'Obsidian Black',
    images: [
      {
        uploadId: 'img-prado-01',
        originalFileName: 'prado-250-front.jpg',
        previewUrl: '/assets/images/fleet/prado-250-obsidian-hero.png',
        isPrimary: true,
        byteSize: 1845000,
        contentType: 'image/png',
      },
      {
        uploadId: 'img-prado-02',
        originalFileName: 'prado-150-side.jpg',
        previewUrl: '/assets/images/fleet/prado-150-pearl.png',
        isPrimary: false,
        byteSize: 1920000,
        contentType: 'image/png',
      },
      {
        uploadId: 'img-prado-03',
        originalFileName: 'prado-150-rear.jpg',
        previewUrl: '/assets/images/fleet/prado-150-graphite.png',
        isPrimary: false,
        byteSize: 1740000,
        contentType: 'image/png',
      },
    ],
    lastDecisionReason: null,
    reviewedByStaffEmail: null,
    reviewedAt: null,
  },
  {
    vehicleId: 'veh-lagos-prado-150',
    ownerId: 'owner-lagos-02',
    ownerLegalName: 'Chiamaka Okafor',
    make: 'Toyota',
    model: 'Land Cruiser Prado 150 VX',
    year: 2022,
    category: 'executive_suv',
    seats: 7,
    dailyRateKobo: 18000000,
    areaLabel: 'Victoria Island, Lagos',
    plateMasked: 'KJA-***-XY',
    imageCount: 4,
    moderationStatus: 'approved',
    visibility: 'active',
    discoverable: true,
    version: 2,
    createdAt: '2026-08-15T08:00:00Z',
    submittedAt: '2026-08-15T09:15:00Z',
    thumbnailUrl: '/assets/images/fleet/prado-150-pearl.png',
    description: 'Clean 2022 Toyota Land Cruiser Prado 150 VX in Pearl White. Perfect for corporate travel, VIP security details, and Victoria Island / Lekki commutes.',
    transmission: 'Automatic',
    colour: 'Pearl White',
    images: [
      {
        uploadId: 'img-prado-150-01',
        originalFileName: 'prado-150-pearl.jpg',
        previewUrl: '/assets/images/fleet/prado-150-pearl.png',
        isPrimary: true,
        byteSize: 2100000,
        contentType: 'image/png',
      },
    ],
    lastDecisionReason: null,
    reviewedByStaffEmail: 'ops.moderator@mmgconcierge.com',
    reviewedAt: '2026-08-15T11:00:00Z',
  },
  {
    vehicleId: 'veh-lagos-mercedes-e',
    ownerId: 'owner-lagos-03',
    ownerLegalName: 'Oluwaseun Balogun',
    make: 'Mercedes-Benz',
    model: 'E-Class E350 Sedan',
    year: 2023,
    category: 'executive_sedan',
    seats: 4,
    dailyRateKobo: 16000000,
    areaLabel: 'Banana Island, Lagos',
    plateMasked: 'EKY-***-ZZ',
    imageCount: 5,
    moderationStatus: 'pending_review',
    visibility: 'paused',
    discoverable: false,
    version: 1,
    createdAt: '2026-08-16T14:00:00Z',
    submittedAt: '2026-08-16T14:45:00Z',
    thumbnailUrl: '/assets/images/fleet/graphite-executive-sedan.png',
    description: '2023 Mercedes-Benz E350 AMG Line. Executive graphite saloon with panoramic roof, Burmester sound, and vetted bilingual chauffeur.',
    transmission: 'Automatic',
    colour: 'Graphite Grey',
    images: [
      {
        uploadId: 'img-merc-01',
        originalFileName: 'mercedes-e350.jpg',
        previewUrl: '/assets/images/fleet/graphite-executive-sedan.png',
        isPrimary: true,
        byteSize: 1950000,
        contentType: 'image/png',
      },
    ],
    lastDecisionReason: null,
    reviewedByStaffEmail: null,
    reviewedAt: null,
  },
];

export class FixtureAdminVehicleGateway implements AdminVehicleGateway {
  private vehicles: VehicleModerationDetail[];

  constructor(initialVehicles: VehicleModerationDetail[] = FIXTURE_VEHICLES) {
    this.vehicles = [...initialVehicles];
  }

  async listVehicles(options?: ListVehiclesOptions): Promise<ListVehiclesResult> {
    let list = [...this.vehicles];
    if (options?.statusFilter && options.statusFilter !== 'all') {
      list = list.filter((v) => v.moderationStatus === options.statusFilter);
    }
    return {
      items: list,
      hasMore: false,
      nextCursor: null,
    };
  }

  async getVehicleDetail(vehicleId: string): Promise<VehicleModerationDetail | null> {
    const found = this.vehicles.find((v) => v.vehicleId === vehicleId);
    return found ? { ...found } : null;
  }

  async reviewVehicle(decision: FixtureReviewVehicleDecision): Promise<{ success: boolean; newVersion: number }> {
    const idx = this.vehicles.findIndex((v) => v.vehicleId === decision.vehicleId);
    if (idx === -1) {
      throw new Error(`Vehicle ${decision.vehicleId} not found.`);
    }

    const current = this.vehicles[idx];
    if (current.version !== decision.expectedVersion) {
      throw new Error(
        `Version conflict: Vehicle is at version ${current.version}, expected ${decision.expectedVersion}. Please refresh.`,
      );
    }

    const newVersion = current.version + 1;
    this.vehicles[idx] = {
      ...current,
      moderationStatus: decision.action === 'approve' ? 'approved' : 'rejected',
      lastDecisionReason: decision.reason || null,
      reviewedByStaffEmail: decision.staffEmail,
      reviewedAt: new Date().toISOString(),
      version: newVersion,
    };

    return { success: true, newVersion };
  }

  async mintSignedImageUrl(storagePath: string): Promise<string | null> {
    return storagePath ? `/mock-storage/${storagePath}` : null;
  }
}
