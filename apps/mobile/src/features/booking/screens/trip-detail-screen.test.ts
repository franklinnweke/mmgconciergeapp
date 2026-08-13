import { describe, expect, it } from 'vitest';

import { previewRenterTrips } from '../data/preview-renter-trips';
import { RenterTripActionUnavailableError } from '../data/renter-trip-action-gateway';
import {
  initialRenterTripActionSession,
  reduceRenterTripActionSession,
  tripDetailMode,
  tripDetailPresentation,
} from '../domain/renter-trip-actions';
import { permittedRenterActions, renterTripTimeline, tripStateCopy } from '../domain/renter-trip';

function preview(id: string) {
  const trip = previewRenterTrips.find((item) => item.id === id);
  if (!trip) throw new Error(`Missing preview trip ${id}`);
  return trip;
}

describe('trip detail screen flows', () => {
  it('shows a checkout price snapshot and a payment-failure notice that no charge occurred', () => {
    const trip = preview('preview-checkout');
    const copy = tripStateCopy(trip.state);
    const presentation = tripDetailPresentation(trip);
    expect(copy.title).toMatch(/secure checkout/i);
    expect(trip.priceSnapshot.renterTotalKobo).toBeGreaterThan(0);
    expect(presentation.primary).toBe('payment');
    expect(presentation.secondary).toEqual(['support']);

    const failed = reduceRenterTripActionSession(
      reduceRenterTripActionSession(initialRenterTripActionSession, { type: 'start', action: 'payment' }),
      { type: 'finish', action: 'payment', error: new RenterTripActionUnavailableError('payment') },
    );
    expect(failed.notice?.message).toMatch(/no charge was attempted/i);
  });

  it('keeps paid-pending-owner off payment and confirms cancellation before an unavailable result', () => {
    const trip = preview('preview-paid');
    expect(permittedRenterActions(trip.state)).toEqual(['support', 'cancellation']);
    expect(tripDetailPresentation(trip).primary).toBe('cancellation');
    expect(tripDetailPresentation(trip).secondary).toEqual(['support']);

    let session = reduceRenterTripActionSession(initialRenterTripActionSession, {
      type: 'begin',
      action: 'cancellation',
    });
    expect(session.confirmingCancellation).toBe(true);
    session = reduceRenterTripActionSession(session, { type: 'start', action: 'cancellation' });
    session = reduceRenterTripActionSession(session, {
      type: 'finish',
      action: 'cancellation',
      error: new RenterTripActionUnavailableError('cancellation'),
    });
    expect(session.notice?.message).toMatch(/journey was not changed/i);
  });

  it('makes concierge the only intervention action and does not imply resolution', () => {
    const trip = preview('preview-intervention');
    expect(tripDetailPresentation(trip)).toMatchObject({ primary: 'support', secondary: [], isTerminal: false });
    expect(renterTripTimeline(trip.state).find((step) => step.id === 'resolution')).toMatchObject({
      status: 'current',
    });
    const failed = reduceRenterTripActionSession(
      reduceRenterTripActionSession(initialRenterTripActionSession, { type: 'start', action: 'support' }),
      { type: 'finish', action: 'support', error: new RenterTripActionUnavailableError('support') },
    );
    expect(failed.notice?.message).toMatch(/no message was sent/i);
  });

  it('treats refunded journeys as terminal and uses provider-state refund copy', () => {
    const trip = preview('preview-refunded');
    expect(tripDetailPresentation(trip).isTerminal).toBe(true);
    expect(tripStateCopy(trip.state).body).toMatch(/payment provider has reported this booking as refunded/i);
    expect(renterTripTimeline(trip.state).every((step) => step.status === 'complete')).toBe(true);
  });

  it('recovers a missing deep link without treating it as a live trip', () => {
    expect(tripDetailMode({ initializing: false, trip: null, syncState: 'synced' })).toBe('missing');
    expect(previewRenterTrips.some((trip) => trip.id === 'does-not-exist')).toBe(false);
  });
});
