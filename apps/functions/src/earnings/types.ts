import type {
  PaidBookingState,
  PriceSnapshot,
} from '@mmg/contracts';
import type { OwnerEarningState } from '@mmg/contracts/earnings';

export type StoredOwnerEarning = {
  bookingId: string;
  ownerId: string;
  vehicleId: string;
  amountKobo: number;
  currency: 'NGN';
  state: OwnerEarningState;
  startDate: string;
  endDate: string;
  vehicleSnapshot: { displayName: string };
  createdAt: Date;
  availableAt?: Date | null;
  reviewReason?: string | null;
  updatedAt: Date;
  version: number;
};

export type StoredOwnerSettlementState = {
  ownerId: string;
  pendingKobo: number;
  availableKobo: number;
  reservedKobo: number;
  activePayoutId: string | null;
  settlementHold: boolean;
  holdReason?: string | null;
  version: number;
  updatedAt: Date;
};

export type StoredBookingForLifecycle = {
  bookingId: string;
  ownerId: string;
  vehicleId: string;
  renterId: string;
  startDate: string;
  endDate: string;
  state: PaidBookingState;
  version: number;
  priceSnapshot?: PriceSnapshot;
  vehicleSnapshot?: { displayName: string };
  settlementRestriction?: boolean;
};

export type TripCompletionActor = {
  uid: string;
  email?: string;
  isStaff: boolean;
  role?: string;
};

export type TripReportEndedActor = {
  uid: string;
};

export type SettlementHoldActor = {
  uid: string;
  email?: string;
  role: 'finance_admin' | 'super_admin';
};

export type ReportTripEndedInput = {
  bookingId: string;
  actor: TripReportEndedActor;
  commandRequestId: string;
  requestHash: string;
  idempotencyDocumentId: string;
  now: Date;
};

export type ConfirmBookingCompletionInput = {
  bookingId: string;
  actor: TripCompletionActor;
  commandRequestId: string;
  requestHash: string;
  idempotencyDocumentId: string;
  now: Date;
};

export type SetOwnerSettlementHoldInput = {
  ownerId: string;
  hold: boolean;
  reason?: string;
  actor: SettlementHoldActor;
  commandRequestId: string;
  requestHash: string;
  idempotencyDocumentId: string;
  now: Date;
};
