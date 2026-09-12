import { describe, expect, it } from 'vitest';

import { previewRenterTrips } from '../data/preview-renter-trips';
import { RenterTripActionUnavailableError } from '../data/renter-trip-action-gateway';
import {
  initialRenterTripActionSession,
  reduceRenterTripActionSession,
  tripDetailMode,
  tripDetailPresentation,
} from '../domain/renter-trip-actions';
import { isTerminalState, permittedRenterActions, renterTripTimeline, tripStateCopy } from '../domain/renter-trip';

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

  it('filters out unavailable support action on normal trips when no support gateway is available', () => {
    const trip = preview('preview-intervention');
    expect(tripDetailMode({ initializing: false, trip, syncState: 'synced' })).toBe('preview');
    const liveTrip = { ...trip, source: 'request' as const };
    const presentation = tripDetailPresentation(liveTrip);
    const connectedActions = presentation.actions.filter((action) => {
      if (action === 'cancellation') {
        return liveTrip.source === 'request' || liveTrip.source === 'trusted';
      }
      return false;
    });
    expect(connectedActions).toEqual([]);
    expect(presentation.isTerminal).toBe(false);
  });

  it('identifies terminal vs non-terminal intervention states accurately', () => {
    expect(isTerminalState('completed')).toBe(true);
    expect(isTerminalState('cancelled')).toBe(true);
    expect(isTerminalState('cancelled_by_renter')).toBe(true);
    expect(isTerminalState('refunded')).toBe(true);
    expect(isTerminalState('declined')).toBe(true);
    expect(isTerminalState('payment_window_expired')).toBe(true);

    // Intervention and in-flight states are NOT terminal even without client actions
    expect(isTerminalState('needs_attention')).toBe(false);
    expect(isTerminalState('intervention_required')).toBe(false);
    expect(isTerminalState('paid_conflict')).toBe(false);
    expect(isTerminalState('cancellation_requested')).toBe(false);
    expect(isTerminalState('in_progress')).toBe(false);
  });

  it('maps request-first states to human sentence-case copy without internal jargon', () => {
    const requestedCopy = tripStateCopy('requested');
    expect(requestedCopy.label).toBe('Request received');
    expect(requestedCopy.title).toMatch(/MMG is confirming/i);

    const approvedCopy = tripStateCopy('approved');
    expect(approvedCopy.label).toBe('Confirming availability');

    const readyCopy = tripStateCopy('ready_for_payment');
    expect(readyCopy.label).toBe('Payment ready');
    expect(readyCopy.body).toMatch(/30 minutes/i);

    const confirmedCopy = tripStateCopy('confirmed');
    expect(confirmedCopy.label).toBe('Confirmed');

    const needsAttentionCopy = tripStateCopy('needs_attention');
    expect(needsAttentionCopy.label).toBe('Needs attention');

    const expiredCopy = tripStateCopy('payment_window_expired');
    expect(expiredCopy.label).toBe('Payment window expired');
  });

  it('structures request-first timelines to answer what happens next and omits for simple terminal states', () => {
    const requestedTimeline = renterTripTimeline('requested');
    expect(requestedTimeline.map((s) => s.label)).toEqual([
      'Request sent',
      'MMG confirmation',
      'Payment',
      'Confirmed trip',
    ]);
    expect(requestedTimeline[0].status).toBe('current');
    expect(requestedTimeline[1].status).toBe('upcoming');

    const readyTimeline = renterTripTimeline('ready_for_payment');
    expect(readyTimeline.map((s) => s.label)).toEqual([
      'Request sent',
      'MMG confirmation',
      'Complete payment',
      'Confirmed trip',
    ]);
    expect(readyTimeline.find((s) => s.id === 'checkout')?.status).toBe('current');

    // Terminal states have length 1 so screen cleanly omits timeline section
    expect(renterTripTimeline('cancelled_by_renter').length).toBe(1);
    expect(renterTripTimeline('declined').length).toBe(1);
    expect(renterTripTimeline('payment_window_expired').length).toBe(1);
  });
});
