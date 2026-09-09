import { describe, expect, it } from 'vitest';

import { RenterTripActionUnavailableError } from '../data/renter-trip-action-gateway';
import {
  initialRenterTripActionSession,
  noticeForActionResult,
  reduceRenterTripActionSession,
  splitRenterTripActions,
  tripDetailMode,
  tripDetailPresentation,
} from './renter-trip-actions';
import { stateGroup, type RenterTrip } from './renter-trip';
import { previewRenterTrips } from '../data/preview-renter-trips';

const price = previewRenterTrips[0]!.priceSnapshot;

function trip(overrides: Partial<RenterTrip> = {}): RenterTrip {
  const state = overrides.state ?? 'checkout_pending';
  return {
    id: 'trip-one',
    vehicleId: 'preview-pearl-suv',
    startDate: '2026-09-13',
    endDate: '2026-09-16',
    state,
    priceSnapshot: price,
    group: stateGroup(state),
    updatedAt: '2026-08-13T12:14:00.000Z',
    source: 'trusted',
    vehicleSnapshot: {
      displayName: 'Pearl Executive SUV',
      areaLabel: 'Victoria Island',
      categoryLabel: 'Executive SUV',
      imageKey: 'pearl-suv',
    },
    ...overrides,
  };
}

describe('renter trip detail actions', () => {
  it('keeps concierge as a secondary fallback when a state action exists', () => {
    expect(splitRenterTripActions(['payment', 'support'])).toEqual({
      primary: 'payment',
      secondary: ['support'],
    });
    expect(splitRenterTripActions(['support', 'cancellation'])).toEqual({
      primary: 'cancellation',
      secondary: ['support'],
    });
    expect(splitRenterTripActions(['support'])).toEqual({
      primary: 'support',
      secondary: [],
    });
    expect(tripDetailPresentation(trip({ state: 'refunded' })).isTerminal).toBe(true);
  });

  it('requires cancellation confirmation and reports that the journey did not change', () => {
    let session = reduceRenterTripActionSession(initialRenterTripActionSession, {
      type: 'begin',
      action: 'cancellation',
    });
    expect(session.confirmingCancellation).toBe(true);
    expect(session.notice).toBeNull();

    session = reduceRenterTripActionSession(session, { type: 'start', action: 'cancellation' });
    expect(session.pendingAction).toBe('cancellation');

    session = reduceRenterTripActionSession(session, {
      type: 'finish',
      action: 'cancellation',
      error: new RenterTripActionUnavailableError('cancellation'),
    });
    expect(session.confirmingCancellation).toBe(false);
    expect(session.pendingAction).toBeNull();
    expect(session.notice?.message).toMatch(/journey was not changed/i);
  });

  it('permits release_hold for intent_created, requires confirmation, and avoids refund language', () => {
    const presentation = tripDetailPresentation(trip({ state: 'intent_created' }));
    expect(presentation.actions).toEqual(['release_hold', 'support']);
    expect(presentation.primary).toBe('release_hold');
    expect(presentation.secondary).toEqual(['support']);

    let session = reduceRenterTripActionSession(initialRenterTripActionSession, {
      type: 'begin',
      action: 'release_hold',
    });
    expect(session.confirmingReleaseHold).toBe(true);
    expect(session.confirmingCancellation).toBe(false);
    expect(session.notice).toBeNull();

    session = reduceRenterTripActionSession(session, { type: 'dismiss-release-hold' });
    expect(session.confirmingReleaseHold).toBe(false);

    session = reduceRenterTripActionSession(session, { type: 'start', action: 'release_hold' });
    expect(session.pendingAction).toBe('release_hold');
    expect(session.confirmingReleaseHold).toBe(true);

    const failed = reduceRenterTripActionSession(session, {
      type: 'finish',
      action: 'release_hold',
      error: new Error('network-failed'),
    });
    expect(failed.confirmingReleaseHold).toBe(false);
    expect(failed.pendingAction).toBeNull();
    expect(failed.notice?.message).toMatch(/dates are still held/i);
    expect(failed.notice?.message.toLowerCase()).not.toContain('refund');

    const succeeded = reduceRenterTripActionSession(session, {
      type: 'finish',
      action: 'release_hold',
    });
    expect(succeeded.notice?.message.toLowerCase()).not.toContain('refund');
  });

  it('states that payment failure did not attempt a charge and support sent no message', () => {
    expect(noticeForActionResult('payment', new RenterTripActionUnavailableError('payment')).message)
      .toMatch(/no charge was attempted/i);
    expect(noticeForActionResult('support', new RenterTripActionUnavailableError('support')).message)
      .toMatch(/no message was sent/i);
    expect(noticeForActionResult('support', new Error('network')).message)
      .toMatch(/no journey state changed/i);
  });

  it('blocks a second action while one is pending and replaces stale notices', () => {
    let session = reduceRenterTripActionSession(initialRenterTripActionSession, {
      type: 'start',
      action: 'payment',
    });
    session = {
      ...session,
      notice: { tone: 'warning', message: 'stale' },
    };
    session = reduceRenterTripActionSession(session, { type: 'start', action: 'support' });
    expect(session.pendingAction).toBe('payment');

    session = reduceRenterTripActionSession(
      { ...initialRenterTripActionSession, notice: { tone: 'info', message: 'stale' } },
      { type: 'start', action: 'support' },
    );
    expect(session.notice).toBeNull();
    expect(session.pendingAction).toBe('support');
  });

  it('distinguishes initializing, missing, preview, offline, and ready modes', () => {
    expect(tripDetailMode({ initializing: true, trip: null, syncState: 'syncing' })).toBe('initializing');
    expect(tripDetailMode({ initializing: false, trip: null, syncState: 'synced' })).toBe('missing');
    expect(tripDetailMode({
      initializing: false,
      trip: trip({ source: 'preview' }),
      syncState: 'local-only',
    })).toBe('preview');
    expect(tripDetailMode({
      initializing: false,
      trip: trip({ source: 'trusted' }),
      syncState: 'offline',
    })).toBe('offline');
    expect(tripDetailMode({
      initializing: false,
      trip: trip({ source: 'trusted' }),
      syncState: 'synced',
    })).toBe('ready');
  });
});
