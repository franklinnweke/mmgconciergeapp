import type {
  AvailabilityBlockReason,
  AvailabilityBlockType,
  CanonicalErrorCode,
  CommandSafeReason,
  CreateBookingIntentResult,
  PaidBookingState,
  PriceSnapshot,
  RenterVehicleSnapshot,
} from '@mmg/contracts';

export type TrustedVehicle = {
  id: string;
  ownerId: string;
  active: boolean;
  ownerDailyRateKobo: number;
  vehicleSnapshot: RenterVehicleSnapshot;
};

export type TrustedBookingConfig = {
  deliveryFeeKobo: number;
  serviceFeeBps: number;
  serviceFeeFixedKobo: number;
  ownerCommissionBps: number;
  configVersion: string;
  termsVersion: string;
  cancellationPolicyVersion: string;
};

export type BlockingInterval = {
  blockId?: string;
  startDate: string;
  endDate: string;
  state: 'held' | 'paid' | 'confirmed' | 'owner_block';
  type?: AvailabilityBlockType;
  reason?: AvailabilityBlockReason;
  expiresAt?: Date;
};

export type StoredIdempotency = {
  requestHash: string;
  result: unknown;
};

export type NewIntentRecord = {
  intentId: string;
  renterId: string;
  ownerId: string;
  vehicleId: string;
  startDate: string;
  endDate: string;
  state: 'intent_created' | 'checkout_pending' | 'paid' | 'expired' | 'failed' | 'invalid' | 'paid_conflict';
  priceSnapshot: PriceSnapshot;
  vehicleSnapshot: RenterVehicleSnapshot;
  paymentReference?: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
};

export type StoredAvailabilityBlock = {
  blockId: string;
  vehicleId: string;
  ownerId: string;
  startDate: string;
  endDate: string;
  type: AvailabilityBlockType;
  reason?: AvailabilityBlockReason;
  referenceId?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
};

export type StoredBookingRecord = {
  bookingId: string;
  intentId: string;
  renterId: string;
  ownerId: string;
  vehicleId: string;
  startDate: string;
  endDate: string;
  state: PaidBookingState;
  version: number;
  priceSnapshot: PriceSnapshot;
  vehicleSnapshot: RenterVehicleSnapshot;
  paymentReference: string;
  paidAmountKobo: number;
  paymentEnvironment: 'test' | 'live';
  chauffeurNotes?: string;
  ownerRejectionReason?: string;
  ownerRejectionDetails?: string;
  adminNotes?: string;
  reassignedFromVehicleId?: string;
  paidAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type BookingAuditEvent = {
  actorId: string;
  actorType: 'system' | 'renter' | 'owner' | 'admin' | 'provider';
  entityId: string;
  entityType: 'bookingIntent' | 'booking' | 'availabilityBlock';
  eventType: string;
  fromState: string | null;
  toState: string;
  requestId: string;
  occurredAt: Date;
  details?: Record<string, unknown>;
};

export type BookingNotificationOutbox = {
  notificationId: string;
  recipientId: string;
  recipientRole: 'owner' | 'renter' | 'admin';
  template: string;
  channel: 'push' | 'sms' | 'email';
  data: Record<string, unknown>;
  createdAt: Date;
  status: 'pending' | 'sent' | 'failed';
};

export interface BookingTransaction {
  getIdempotency(documentId: string): Promise<StoredIdempotency | null>;
  getVehicle(vehicleId: string): Promise<TrustedVehicle | null>;
  getBookingConfig(): Promise<TrustedBookingConfig | null>;
  readAvailabilitySentinel(vehicleId: string): Promise<void>;
  writeAvailabilitySentinel(vehicleId: string, updatedAt: Date): void;

  listBlockingIntervals(vehicleId: string, exclusiveEndDate: string): Promise<readonly BlockingInterval[]>;
  getAvailabilityBlocksInWindow(
    vehicleId: string,
    windowStartDate: string,
    windowEndDate: string,
  ): Promise<readonly StoredAvailabilityBlock[]>;
  createAvailabilityBlock(block: StoredAvailabilityBlock): void;
  removeAvailabilityBlock(vehicleId: string, blockId: string): void;
  getAvailabilityBlock(blockId: string): Promise<StoredAvailabilityBlock | null>;

  getIntent(intentId: string): Promise<NewIntentRecord | null>;
  createIntent(record: NewIntentRecord): void;
  updateIntent(record: NewIntentRecord): void;

  getBooking(bookingId: string): Promise<StoredBookingRecord | null>;
  createBooking(record: StoredBookingRecord): void;
  updateBooking(record: StoredBookingRecord): void;

  createHeldBlock(record: NewIntentRecord): void;
  updateHeldBlockToBooked(intentId: string, bookingId: string, updatedAt: Date): void;
  releaseHeldBlock(intentId: string): void;

  createAuditEvent(event: BookingAuditEvent): void;
  createNotificationOutbox(record: BookingNotificationOutbox): void;
  saveIdempotency(documentId: string, requestHash: string, result: unknown, createdAt: Date): void;
}

export interface BookingRepository {
  runTransaction<T>(work: (transaction: BookingTransaction) => Promise<T>): Promise<T>;
}
