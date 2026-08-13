import type { PriceSnapshot } from '@mmg/contracts';

import type { AdminBookingGateway } from './admin-booking-gateway';
import { permittedAdminActions, type AdminBooking, validateRejectionReason } from '../domain/admin-booking';

const basePrice: PriceSnapshot = {
  currency: 'NGN',
  chargedDays: 3,
  ownerDailyRateKobo: 38_500_000,
  baseRentalKobo: 115_500_000,
  deliveryFeeKobo: 0,
  serviceFeeBps: 800,
  serviceFeeFixedKobo: 0,
  serviceFeeKobo: 9_240_000,
  ownerCommissionBps: 1_500,
  ownerCommissionKobo: 17_325_000,
  ownerEarningsKobo: 98_175_000,
  renterTotalKobo: 124_740_000,
  configVersion: 'pricing-2026-08',
  termsVersion: 'terms-2026-08',
  cancellationPolicyVersion: 'cancellation-2026-08',
};

const records: AdminBooking[] = [
  {
    id: 'MMG-260913-A7F2',
    renterReference: 'REN-•••-1842',
    vehicle: { id: 'pearl-suv', displayName: 'Pearl Executive SUV', areaLabel: 'Victoria Island', categoryLabel: 'EXECUTIVE SUV' },
    startDate: '2026-09-13',
    endDate: '2026-09-16',
    state: 'paid_pending_owner',
    payment: { status: 'verified', referenceSuffix: '•••• 8214', verifiedAt: '2026-08-13T12:14:00.000Z' },
    priceSnapshot: basePrice,
    updatedAt: '2026-08-13T12:14:00.000Z',
    timeline: [
      { id: 'a1', actorType: 'system', eventType: 'Booking intent created', occurredAt: '2026-08-13T12:01:00.000Z', fromState: null, toState: 'intent_created' },
      { id: 'a2', actorType: 'provider', eventType: 'Payment verified', occurredAt: '2026-08-13T12:14:00.000Z', fromState: 'checkout_pending', toState: 'paid_pending_owner' },
    ],
  },
  {
    id: 'MMG-260905-19C8',
    renterReference: 'REN-•••-7601',
    vehicle: { id: 'graphite-sedan', displayName: 'Graphite Executive Saloon', areaLabel: 'Ikoyi', categoryLabel: 'EXECUTIVE SALOON' },
    startDate: '2026-09-05',
    endDate: '2026-09-07',
    state: 'intervention_required',
    payment: { status: 'verified', referenceSuffix: '•••• 4429', verifiedAt: '2026-08-13T10:42:00.000Z' },
    priceSnapshot: { ...basePrice, chargedDays: 2, baseRentalKobo: 77_000_000, serviceFeeKobo: 6_160_000, ownerCommissionKobo: 11_550_000, ownerEarningsKobo: 65_450_000, renterTotalKobo: 83_160_000 },
    updatedAt: '2026-08-13T11:20:00.000Z',
    timeline: [
      { id: 'b1', actorType: 'provider', eventType: 'Payment verified', occurredAt: '2026-08-13T10:42:00.000Z', fromState: 'checkout_pending', toState: 'paid_pending_owner' },
      { id: 'b2', actorType: 'owner', eventType: 'Owner reported a vehicle issue', occurredAt: '2026-08-13T11:20:00.000Z', fromState: 'paid_pending_owner', toState: 'intervention_required' },
    ],
  },
  {
    id: 'MMG-260821-5D31',
    renterReference: 'REN-•••-3088',
    vehicle: { id: 'pearl-suv', displayName: 'Pearl Executive SUV', areaLabel: 'Lekki Phase 1', categoryLabel: 'EXECUTIVE SUV' },
    startDate: '2026-08-21',
    endDate: '2026-08-24',
    state: 'confirmed',
    payment: { status: 'verified', referenceSuffix: '•••• 1057', verifiedAt: '2026-08-12T15:10:00.000Z' },
    priceSnapshot: basePrice,
    updatedAt: '2026-08-12T16:03:00.000Z',
    timeline: [
      { id: 'c1', actorType: 'provider', eventType: 'Payment verified', occurredAt: '2026-08-12T15:10:00.000Z', fromState: 'checkout_pending', toState: 'paid_pending_owner' },
      { id: 'c2', actorType: 'owner', eventType: 'Vehicle and chauffeur confirmed', occurredAt: '2026-08-12T16:03:00.000Z', fromState: 'paid_pending_owner', toState: 'confirmed' },
    ],
  },
  {
    id: 'MMG-260802-E410',
    renterReference: 'REN-•••-9250',
    vehicle: { id: 'graphite-sedan', displayName: 'Graphite Executive Saloon', areaLabel: 'Victoria Island', categoryLabel: 'EXECUTIVE SALOON' },
    startDate: '2026-08-02',
    endDate: '2026-08-04',
    state: 'refunded',
    payment: { status: 'refunded', referenceSuffix: '•••• 6671', verifiedAt: '2026-07-30T09:20:00.000Z' },
    priceSnapshot: { ...basePrice, chargedDays: 2, baseRentalKobo: 77_000_000, serviceFeeKobo: 6_160_000, ownerCommissionKobo: 11_550_000, ownerEarningsKobo: 65_450_000, renterTotalKobo: 83_160_000 },
    updatedAt: '2026-08-01T12:00:00.000Z',
    timeline: [
      { id: 'd1', actorType: 'provider', eventType: 'Payment verified', occurredAt: '2026-07-30T09:20:00.000Z', fromState: 'checkout_pending', toState: 'paid_pending_owner' },
      { id: 'd2', actorType: 'system', eventType: 'Refund completed', occurredAt: '2026-08-01T12:00:00.000Z', fromState: 'refund_pending', toState: 'refunded' },
    ],
  },
];

export const fixtureBookings: readonly AdminBooking[] = records;

function cloneBooking(booking: AdminBooking): AdminBooking {
  return structuredClone(booking);
}

export function createFixtureAdminBookingGateway(): AdminBookingGateway {
  let bookings = records.map(cloneBooking);

  function findActionable(bookingId: string) {
    const booking = bookings.find((candidate) => candidate.id === bookingId);
    if (!booking || permittedAdminActions(booking).length === 0) {
      throw new Error('Booking is missing, stale, or no longer actionable.');
    }
    return booking;
  }

  return {
    async listBookings() {
      return bookings.map(cloneBooking);
    },
    async confirmBooking(bookingId) {
      const booking = findActionable(bookingId);
      const updated: AdminBooking = {
        ...booking,
        state: 'confirmed',
        updatedAt: new Date().toISOString(),
        timeline: [...booking.timeline, {
          id: `fixture-${Date.now()}`,
          actorType: 'admin',
          eventType: 'Booking confirmed in fixture mode',
          occurredAt: new Date().toISOString(),
          fromState: booking.state,
          toState: 'confirmed',
        }],
      };
      bookings = bookings.map((candidate) => candidate.id === bookingId ? updated : candidate);
      return cloneBooking(updated);
    },
    async rejectBooking(bookingId, reason) {
      const booking = findActionable(bookingId);
      const normalizedReason = validateRejectionReason(reason);
      const updated: AdminBooking = {
        ...booking,
        state: 'intervention_required',
        updatedAt: new Date().toISOString(),
        timeline: [...booking.timeline, {
          id: `fixture-${Date.now()}`,
          actorType: 'admin',
          eventType: normalizedReason,
          occurredAt: new Date().toISOString(),
          fromState: booking.state,
          toState: 'intervention_required',
        }],
      };
      bookings = bookings.map((candidate) => candidate.id === bookingId ? updated : candidate);
      return cloneBooking(updated);
    },
  };
}
