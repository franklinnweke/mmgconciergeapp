import type {
  VehicleCategory,
  VehicleModerationStatus,
  VehicleReviewChecklistKey,
  VehicleReviewDecision,
  VehicleVisibility,
} from '@mmg/contracts';

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
  visibility: VehicleVisibility;
  discoverable: boolean;
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

export type VehicleChecklistKey = VehicleReviewChecklistKey;

export type VehicleChecklistItem = {
  key: VehicleChecklistKey;
  label: string;
  description: string;
};

export const VEHICLE_CHECKLIST_ITEMS: VehicleChecklistItem[] = [
  {
    key: 'images_complete_and_legible',
    label: '1. Photo Quality & Completeness',
    description: 'Multi-angle exterior & cabin photos are clear, legible, and uncorrupted without watermarks or PII.',
  },
  {
    key: 'specs_match_images',
    label: '2. Specifications Match Photos',
    description: 'Make, model, year, colour, and seating capacity match the uploaded vehicle images.',
  },
  {
    key: 'plate_matches_documents',
    label: '3. Registration Plate & Documents',
    description: 'Nigerian registration plate matches vehicle identity and vehicle papers in private records.',
  },
  {
    key: 'lagos_base_plausible',
    label: '4. Lagos Operational Base',
    description: 'Garaged base location is in an approved Lagos operational district (Ikoyi, VI, Lekki, Ikeja, etc.).',
  },
  {
    key: 'rate_plausible',
    label: '5. Platform Rate Economics',
    description: 'Daily rate conforms to platform economic bounds (₦50,000–₦10,000,000) and market plausibility.',
  },
  {
    key: 'chauffeur_delivery_included',
    label: '6. Chauffeur & Delivery Policy',
    description: 'Professional chauffeur and platform dispatch policies are verified as included.',
  },
  {
    key: 'no_fraud_indicators',
    label: '7. Security & Anti-Fraud Clearance',
    description: 'No risk flags, duplicate vehicle plates, or security anomalies detected.',
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
  auditTrailUnavailable?: boolean;
};

export type ReviewVehicleDecisionInput = {
  vehicleId: string;
  expectedVersion: number;
  decision: VehicleReviewDecision;
  reason?: string;
  checklist?: Record<VehicleChecklistKey, boolean>;
};
