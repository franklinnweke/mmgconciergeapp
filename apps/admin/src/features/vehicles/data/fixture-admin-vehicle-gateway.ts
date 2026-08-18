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
    vehicleId: 'veh-lagos-prado-250-first-edition',
    ownerId: 'owner-adeleke-01',
    ownerLegalName: 'Babatunde Adeleke',
    make: 'Toyota',
    model: 'Land Cruiser Prado 250',
    year: 2024,
    category: 'executive_suv',
    seats: 7,
    dailyRateKobo: 38500000,
    areaLabel: 'Ikoyi, Lagos',
    plateMasked: 'LAG-***-AB',
    imageCount: 3,
    moderationStatus: 'pending_review',
    version: 1,
    createdAt: '2026-08-16T10:00:00Z',
    submittedAt: '2026-08-16T10:30:00Z',
    thumbnailUrl: '/assets/images/fleet/prado-250-obsidian-hero.png',
    description: '2024 Toyota Land Cruiser Prado 250 First Edition in Obsidian Black. Equipped with high-clearance executive suspension, dual-zone climate control, privacy glass, and certified executive chauffeur.',
    transmission: 'Automatic',
    colour: 'Obsidian Black',
    images: [
      {
        uploadId: 'img-prado-250-01',
        originalFileName: 'prado-250-obsidian-hero.png',
        previewUrl: '/assets/images/fleet/prado-250-obsidian-hero.png',
        isPrimary: true,
        byteSize: 1845000,
        contentType: 'image/png',
      },
    ],
    lastDecisionReason: null,
    reviewedByStaffEmail: null,
    reviewedAt: null,
  },
  {
    vehicleId: 'veh-lagos-prado-150-vx-pearl',
    ownerId: 'owner-okafor-02',
    ownerLegalName: 'Chiamaka Okafor',
    make: 'Toyota',
    model: 'Land Cruiser Prado 150 VX',
    year: 2023,
    category: 'executive_suv',
    seats: 7,
    dailyRateKobo: 29000000,
    areaLabel: 'Victoria Island, Lagos',
    plateMasked: 'KJA-***-XY',
    imageCount: 2,
    moderationStatus: 'approved',
    version: 1,
    createdAt: '2026-08-15T08:00:00Z',
    submittedAt: '2026-08-15T09:15:00Z',
    thumbnailUrl: '/assets/images/fleet/prado-150-pearl.png',
    description: '2023 Toyota Land Cruiser Prado 150 VX in Pearl White metallic. High-grade executive interior, whisper-quiet cabin, cool-box refrigeration, and professional diplomatic driver.',
    transmission: 'Automatic',
    colour: 'Pearl White',
    images: [
      {
        uploadId: 'img-prado-150-01',
        originalFileName: 'prado-150-pearl.png',
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
    vehicleId: 'veh-lagos-prado-150-txl-graphite',
    ownerId: 'owner-adeleke-01',
    ownerLegalName: 'Babatunde Adeleke',
    make: 'Toyota',
    model: 'Land Cruiser Prado 150 TXL',
    year: 2022,
    category: 'executive_suv',
    seats: 7,
    dailyRateKobo: 25000000,
    areaLabel: 'Lekki Phase 1, Lagos',
    plateMasked: 'APP-***-GR',
    imageCount: 2,
    moderationStatus: 'approved',
    version: 1,
    createdAt: '2026-08-15T12:00:00Z',
    submittedAt: '2026-08-15T13:15:00Z',
    thumbnailUrl: '/assets/images/fleet/prado-150-graphite.png',
    description: '2022 Toyota Land Cruiser Prado 150 TXL in Metallic Graphite Grey. Robust Lagos-road resilience, rear passenger comfort, and certified security-vetted driver.',
    transmission: 'Automatic',
    colour: 'Graphite Grey',
    images: [
      {
        uploadId: 'img-prado-txl-01',
        originalFileName: 'prado-150-graphite.png',
        previewUrl: '/assets/images/fleet/prado-150-graphite.png',
        isPrimary: true,
        byteSize: 1980000,
        contentType: 'image/png',
      },
    ],
    lastDecisionReason: null,
    reviewedByStaffEmail: 'ops.moderator@mmgconcierge.com',
    reviewedAt: '2026-08-15T14:30:00Z',
  },
  {
    vehicleId: 'veh-lagos-lc300-vxr-vip',
    ownerId: 'owner-fashola-03',
    ownerLegalName: 'Tunde Fashola',
    make: 'Toyota',
    model: 'Land Cruiser 300 VXR',
    year: 2024,
    category: 'executive_suv',
    seats: 7,
    dailyRateKobo: 55000000,
    areaLabel: 'Banana Island, Ikoyi, Lagos',
    plateMasked: 'BDG-***-LC',
    imageCount: 2,
    moderationStatus: 'approved',
    version: 1,
    createdAt: '2026-08-16T09:00:00Z',
    submittedAt: '2026-08-16T10:00:00Z',
    thumbnailUrl: '/assets/images/fleet/lc300-vxr-white.png',
    description: '2024 Toyota Land Cruiser 300 VXR VIP Flagship in Super White. Twin-turbo V6, ventilated executive leather, heads-up display, and VIP protocol chauffeur.',
    transmission: 'Automatic',
    colour: 'Super White',
    images: [
      {
        uploadId: 'img-lc300-01',
        originalFileName: 'lc300-vxr-white.png',
        previewUrl: '/assets/images/fleet/lc300-vxr-white.png',
        isPrimary: true,
        byteSize: 2200000,
        contentType: 'image/png',
      },
    ],
    lastDecisionReason: null,
    reviewedByStaffEmail: 'ops.moderator@mmgconcierge.com',
    reviewedAt: '2026-08-16T11:30:00Z',
  },
  {
    vehicleId: 'veh-lagos-mercedes-s580-saloon',
    ownerId: 'owner-nnamdi-04',
    ownerLegalName: 'Dr. Emeka Nnamdi',
    make: 'Mercedes-Benz',
    model: 'S 580 4MATIC',
    year: 2023,
    category: 'executive_sedan',
    seats: 4,
    dailyRateKobo: 48000000,
    areaLabel: 'Victoria Island, Lagos',
    plateMasked: 'JJJ-***-MB',
    imageCount: 2,
    moderationStatus: 'approved',
    version: 1,
    createdAt: '2026-08-16T14:00:00Z',
    submittedAt: '2026-08-16T14:45:00Z',
    thumbnailUrl: '/assets/images/fleet/mercedes-s580-black.png',
    description: '2023 Mercedes-Benz S 580 long-wheelbase in Obsidian Black. Rear executive reclining lounge with calf rests, Burmester 3D surround sound, and uniformed executive chauffeur.',
    transmission: 'Automatic',
    colour: 'Obsidian Black',
    images: [
      {
        uploadId: 'img-s580-01',
        originalFileName: 'mercedes-s580-black.png',
        previewUrl: '/assets/images/fleet/mercedes-s580-black.png',
        isPrimary: true,
        byteSize: 1950000,
        contentType: 'image/png',
      },
    ],
    lastDecisionReason: null,
    reviewedByStaffEmail: 'ops.moderator@mmgconcierge.com',
    reviewedAt: '2026-08-16T15:30:00Z',
  },
  {
    vehicleId: 'veh-lagos-mercedes-vclass-jet',
    ownerId: 'owner-fashola-03',
    ownerLegalName: 'Tunde Fashola',
    make: 'Mercedes-Benz',
    model: 'V-Class Extra Long',
    year: 2023,
    category: 'luxury_van',
    seats: 6,
    dailyRateKobo: 42000000,
    areaLabel: 'Murtala Muhammed Airport, Lagos',
    plateMasked: 'IKJ-***-VC',
    imageCount: 2,
    moderationStatus: 'approved',
    version: 1,
    createdAt: '2026-08-17T08:00:00Z',
    submittedAt: '2026-08-17T09:00:00Z',
    thumbnailUrl: '/assets/images/fleet/mercedes-vclass-vip.png',
    description: '2023 Mercedes-Benz V-Class VIP Jet Lounge in Obsidian Black. 4 facing first-class electric captain chairs, privacy partition, Wi-Fi router, and direct tarmac VIP pickup.',
    transmission: 'Automatic',
    colour: 'Obsidian Black',
    images: [
      {
        uploadId: 'img-vclass-01',
        originalFileName: 'mercedes-vclass-vip.png',
        previewUrl: '/assets/images/fleet/mercedes-vclass-vip.png',
        isPrimary: true,
        byteSize: 2050000,
        contentType: 'image/png',
      },
    ],
    lastDecisionReason: null,
    reviewedByStaffEmail: 'ops.moderator@mmgconcierge.com',
    reviewedAt: '2026-08-17T10:00:00Z',
  },
  {
    vehicleId: 'veh-lagos-mercedes-g63-amg',
    ownerId: 'owner-adeleke-01',
    ownerLegalName: 'Babatunde Adeleke',
    make: 'Mercedes-AMG',
    model: 'G 63',
    year: 2023,
    category: 'executive_suv',
    seats: 5,
    dailyRateKobo: 65000000,
    areaLabel: 'Ikoyi, Lagos',
    plateMasked: 'IKY-***-63',
    imageCount: 2,
    moderationStatus: 'approved',
    version: 1,
    createdAt: '2026-08-17T11:00:00Z',
    submittedAt: '2026-08-17T12:00:00Z',
    thumbnailUrl: '/assets/images/fleet/mercedes-g63-black.png',
    description: '2023 Mercedes-AMG G 63 in Obsidian Black with Night Package. Handcrafted 4.0L V8 Biturbo, unmistakable executive road authority, and defensive-driving trained security escort driver.',
    transmission: 'Automatic',
    colour: 'Obsidian Black',
    images: [
      {
        uploadId: 'img-g63-01',
        originalFileName: 'mercedes-g63-black.png',
        previewUrl: '/assets/images/fleet/mercedes-g63-black.png',
        isPrimary: true,
        byteSize: 2150000,
        contentType: 'image/png',
      },
    ],
    lastDecisionReason: null,
    reviewedByStaffEmail: 'ops.moderator@mmgconcierge.com',
    reviewedAt: '2026-08-17T13:00:00Z',
  },
  {
    vehicleId: 'veh-lagos-lexus-lx600-vip',
    ownerId: 'owner-okafor-02',
    ownerLegalName: 'Chiamaka Okafor',
    make: 'Lexus',
    model: 'LX 600 Ultra Luxury',
    year: 2024,
    category: 'executive_suv',
    seats: 4,
    dailyRateKobo: 58000000,
    areaLabel: 'Eko Atlantic, Lagos',
    plateMasked: 'EKO-***-LX',
    imageCount: 2,
    moderationStatus: 'approved',
    version: 1,
    createdAt: '2026-08-17T14:00:00Z',
    submittedAt: '2026-08-17T15:00:00Z',
    thumbnailUrl: '/assets/images/fleet/lexus-lx600-pearl.png',
    description: '2024 Lexus LX 600 Ultra Luxury in Eminent White Pearl. 4-seat VIP executive layout with Ottoman footrest, Mark Levinson 25-speaker audio, and white-glove chauffeur service.',
    transmission: 'Automatic',
    colour: 'Eminent White Pearl',
    images: [
      {
        uploadId: 'img-lx600-01',
        originalFileName: 'lexus-lx600-pearl.png',
        previewUrl: '/assets/images/fleet/lexus-lx600-pearl.png',
        isPrimary: true,
        byteSize: 2180000,
        contentType: 'image/png',
      },
    ],
    lastDecisionReason: null,
    reviewedByStaffEmail: 'ops.moderator@mmgconcierge.com',
    reviewedAt: '2026-08-17T16:00:00Z',
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
