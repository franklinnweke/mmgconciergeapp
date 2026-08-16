import type { VehicleCategory, VehicleModerationStatus } from '@mmg/contracts';

export type VehicleModerationListItem = {
  vehicleId: string;
  ownerId: string;
  ownerLegalName: string;
  make: string;
  model: string;
  year: number;
  category: VehicleCategory;
  seats: number;
  dailyRateKobo: number;
  areaLabel: string;
  plateMasked: string;
  imageCount: number;
  moderationStatus: VehicleModerationStatus;
  version: number;
  createdAt: string;
  submittedAt: string | null;
  thumbnailUrl: string;
};

export type VehicleImageDetail = {
  uploadId: string;
  originalFileName: string;
  previewUrl: string;
  isPrimary: boolean;
  byteSize: number;
  contentType: string;
};

export type VehicleChecklistKey =
  | 'make_model_eligible'
  | 'photo_coverage'
  | 'plate_registered'
  | 'daily_rate_conforms'
  | 'lagos_serviceable_base'
  | 'capacity_amenities_verified'
  | 'owner_verified';

export type VehicleChecklistItem = {
  key: VehicleChecklistKey;
  label: string;
  description: string;
};

export const VEHICLE_CHECKLIST_ITEMS: VehicleChecklistItem[] = [
  {
    key: 'make_model_eligible',
    label: '1. Executive Make & Model Standards',
    description: 'Vehicle is an approved Toyota Land Cruiser Prado (250/150), Lexus LX, Mercedes E/S/G-Class, or verified executive luxury vehicle.',
  },
  {
    key: 'photo_coverage',
    label: '2. Multi-Angle Photo Coverage',
    description: 'Minimum 4 high-resolution photos showing front exterior, rear, interior cabin, and instrument cluster without watermarks or personal bystander PII.',
  },
  {
    key: 'plate_registered',
    label: '3. Plate & Registration Verification',
    description: 'Nigerian registration plate is formatted correctly (e.g. LAG-882-AB) and verified against state registration guidelines.',
  },
  {
    key: 'daily_rate_conforms',
    label: '4. Daily Rate & Platform Economics',
    description: 'Gross daily rate is realistic for Lagos chauffeured luxury transport (≥ ₦100,000/day) and owner understands the 85% net payout structure.',
  },
  {
    key: 'lagos_serviceable_base',
    label: '5. Lagos Serviceable Dispatch Zone',
    description: 'Garaged base location is situated in an approved Lagos operational district (Ikoyi, VI, Banana Island, Lekki Phase 1, Ikeja GRA, Eko Atlantic).',
  },
  {
    key: 'capacity_amenities_verified',
    label: '6. Cabin Amenities & Air Conditioning',
    description: 'Passenger seats and executive amenities (automatic transmission, dual-zone cold A/C, executive tint) are confirmed functional.',
  },
  {
    key: 'owner_verified',
    label: '7. Owner Identity & Verification Status',
    description: 'Vehicle owner profile has completed identity checks, Nigerian phone OTP verification, and government ID review on MMG Concierge.',
  },
];

export type VehicleModerationDetail = VehicleModerationListItem & {
  description: string;
  transmission: string;
  colour: string;
  images: VehicleImageDetail[];
  lastDecisionReason: string | null;
  reviewedByStaffEmail: string | null;
  reviewedAt: string | null;
};
