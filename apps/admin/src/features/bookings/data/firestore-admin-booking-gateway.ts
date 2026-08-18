import 'server-only';

import type { BookingTimelineEvent, PaidBookingState, PriceSnapshot } from '@mmg/contracts';

import { getAdminFirestore } from '../../auth/server/firebase-admin';
import type { AdminBooking } from '../domain/admin-booking';
import type { AdminBookingGateway } from './admin-booking-gateway';

function hasToDate(value: unknown): value is { toDate: () => Date } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  );
}

function toIsoString(value: unknown, fallback: Date = new Date()): string {
  if (hasToDate(value)) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return fallback.toISOString();
}

function maskRenterReference(renterId: string | null | undefined): string {
  if (!renterId || typeof renterId !== 'string') return 'REN-•••-0000';
  const clean = renterId.trim();
  const suffix = clean.length >= 4 ? clean.slice(-4) : clean.padStart(4, '0');
  return `REN-•••-${suffix}`;
}

function maskReferenceSuffix(paymentReference: string | null | undefined): string {
  if (!paymentReference || typeof paymentReference !== 'string') return '•••• 0000';
  const clean = paymentReference.trim();
  const suffix = clean.length >= 4 ? clean.slice(-4) : clean.padStart(4, '0');
  return `•••• ${suffix}`;
}

export class FirestoreAdminBookingGateway implements AdminBookingGateway {
  private get db() {
    return getAdminFirestore();
  }

  async listBookings(): Promise<readonly AdminBooking[]> {
    const snapshot = await this.db.collection('bookings').orderBy('createdAt', 'desc').limit(50).get();

    const bookings: AdminBooking[] = [];

    for (const doc of snapshot.docs) {
      const data = doc.data();

      // Read audit events for timeline
      let timeline: BookingTimelineEvent[] = [];
      try {
        const auditSnapshot = await this.db
          .collection('booking_audit_events')
          .where('entityId', '==', doc.id)
          .orderBy('occurredAt', 'asc')
          .limit(20)
          .get();

        timeline = auditSnapshot.docs.map((auditDoc) => {
          const aData = auditDoc.data();
          return {
            id: auditDoc.id,
            actorType: aData.actorType ?? 'system',
            eventType: aData.eventType ?? 'Event recorded',
            occurredAt: toIsoString(aData.occurredAt),
            fromState: aData.fromState ?? null,
            toState: aData.toState ?? 'unknown',
          };
        });
      } catch {
        // Degrade timeline gracefully if audit collection index is still propagating
        timeline = [
          {
            id: `initial-${doc.id}`,
            actorType: 'system',
            eventType: 'Booking recorded',
            occurredAt: toIsoString(data.createdAt),
            fromState: null,
            toState: (data.state as PaidBookingState) || 'paid_pending_owner',
          },
        ];
      }

      const priceSnapshot = data.priceSnapshot as PriceSnapshot;
      const vehicleSnapshot = data.vehicleSnapshot ?? {};

      const paymentStatus =
        data.state === 'refunded'
          ? 'refunded'
          : data.state === 'refund_pending'
            ? 'refund_pending'
            : 'verified';

      bookings.push({
        id: doc.id,
        renterReference: maskRenterReference(data.renterId),
        vehicle: {
          id: data.vehicleId ?? 'unknown-vehicle',
          displayName: vehicleSnapshot.displayName ?? 'Executive Vehicle',
          areaLabel: vehicleSnapshot.areaLabel ?? 'Lagos',
          categoryLabel: vehicleSnapshot.categoryLabel ?? 'EXECUTIVE FLEET',
          imageUrl: vehicleSnapshot.imageUrl,
        },
        startDate: data.startDate ?? '',
        endDate: data.endDate ?? '',
        state: (data.state as PaidBookingState) || 'paid_pending_owner',
        payment: {
          status: paymentStatus,
          referenceSuffix: maskReferenceSuffix(data.paymentReference),
          verifiedAt: toIsoString(data.paidAt ?? data.createdAt),
        },
        paymentEnvironment: data.paymentEnvironment === 'live' ? 'live' : 'test',
        version: typeof data.version === 'number' ? data.version : 1,
        priceSnapshot,
        timeline,
        updatedAt: toIsoString(data.updatedAt ?? data.createdAt),
      });
    }

    return bookings;
  }

  async confirmBooking(bookingId: string): Promise<AdminBooking> {
    throw new Error(`Direct gateway confirmation for ${bookingId} is not supported. Use review-booking-action.`);
  }

  async rejectBooking(bookingId: string, reason: string): Promise<AdminBooking> {
    throw new Error(`Direct gateway rejection for ${bookingId} (${reason}) is not supported. Use review-booking-action.`);
  }
}

export const firestoreAdminBookingGateway: AdminBookingGateway = new FirestoreAdminBookingGateway();
