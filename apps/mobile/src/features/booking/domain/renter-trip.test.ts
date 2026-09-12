import { describe, expect, it } from 'vitest';

import { previewRenterTrips } from '../data/preview-renter-trips';
import {
  allRenterTripStates,
  groupTripsForDisplay,
  permittedRenterActions,
  renterTripGroupCopy,
  renterTripTimeline,
  stateGroup,
  tripStateCopy,
} from './renter-trip';

const terminalStates = [
  'completed',
  'cancelled',
  'cancelled_by_renter',
  'refunded',
  'expired',
  'failed',
  'invalid',
  'declined',
  'payment_window_expired',
] as const;

describe('renter trip state presentation', () => {
  it('covers every trusted intent, paid-booking, and legacy state', () => {
    for (const state of allRenterTripStates) {
      const copy = tripStateCopy(state);
      expect(copy.label.length).toBeGreaterThan(0);
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.body.length).toBeGreaterThan(0);
      expect(['active', 'upcoming', 'intervention', 'past']).toContain(stateGroup(state));
      expect(renterTripTimeline(state).length).toBeGreaterThan(0);
      expect(Array.isArray(permittedRenterActions(state))).toBe(true);
    }
  });

  it('labels the active group as active requests, not in progress', () => {
    expect(renterTripGroupCopy.active).toBe('Active requests');
    expect(renterTripGroupCopy.active).not.toContain('in progress');
  });

  it('places in-progress journeys in active and confirmed journeys in upcoming', () => {
    expect(stateGroup('in_progress')).toBe('active');
    expect(stateGroup('confirmed')).toBe('upcoming');
    expect(stateGroup('checkout_pending')).toBe('active');
    expect(stateGroup('paid_pending_owner')).toBe('active');
    expect(stateGroup('requested')).toBe('active');
    expect(stateGroup('approved')).toBe('active');
    expect(stateGroup('ready_for_payment')).toBe('active');
    expect(stateGroup('cancellation_requested')).toBe('active');
    expect(stateGroup('paid_conflict')).toBe('intervention');
    expect(stateGroup('intervention_required')).toBe('intervention');
    expect(stateGroup('needs_attention')).toBe('intervention');
    expect(stateGroup('completed')).toBe('past');
    expect(stateGroup('refunded')).toBe('past');
    expect(stateGroup('cancelled_by_renter')).toBe('past');
    expect(stateGroup('declined')).toBe('past');
    expect(stateGroup('payment_window_expired')).toBe('past');
  });

  it('keeps payment limited while enabling cancellation in safe request and paid stages', () => {
    expect(permittedRenterActions('checkout_pending')).toEqual(['payment', 'support']);
    expect(permittedRenterActions('ready_for_payment')).toEqual(['payment', 'cancellation']);
    expect(permittedRenterActions('requested')).toEqual(['cancellation']);
    expect(permittedRenterActions('approved')).toEqual(['cancellation']);
    expect(permittedRenterActions('cancellation_requested')).toEqual(['support']);
    expect(permittedRenterActions('paid_pending_owner')).toEqual(['support', 'cancellation']);
    expect(permittedRenterActions('confirmed')).toContain('cancellation');
    expect(permittedRenterActions('confirmed')).not.toContain('payment');
    expect(permittedRenterActions('intervention_required')).toEqual(['support']);
    expect(permittedRenterActions('paid_conflict')).toEqual(['support']);
    expect(permittedRenterActions('needs_attention')).toEqual(['support']);

    for (const state of allRenterTripStates) {
      if (state !== 'checkout_pending' && state !== 'ready_for_payment') {
        expect(permittedRenterActions(state)).not.toContain('payment');
      }
    }
    for (const state of terminalStates) {
      expect(permittedRenterActions(state)).toEqual([]);
    }
  });

  it('does not mark intervention review as complete merely because review started', () => {
    for (const state of ['paid_conflict', 'intervention_required', 'needs_attention'] as const) {
      const timeline = renterTripTimeline(state);
      expect(timeline.some((step) => step.status === 'current')).toBe(true);
      expect(timeline.every((step) => {
        if (step.status !== 'complete') return true;
        return !/review has started|review in progress|checking the provider/i.test(`${step.label} ${step.detail}`);
      })).toBe(true);
      expect(timeline.find((step) => step.id === 'resolution')?.status).toBe('current');
      expect(timeline.find((step) => step.id === 'payment')?.status).toBe('complete');
    }
  });

  it('keeps unpaid checkout and pending-owner steps from claiming later work is done', () => {
    expect(renterTripTimeline('checkout_pending').some((step) => step.id === 'payment' && step.status === 'complete')).toBe(false);
    expect(renterTripTimeline('paid_pending_owner').find((step) => step.id === 'owner')?.status).toBe('current');
    expect(renterTripTimeline('ready_for_payment').find((step) => step.id === 'checkout')?.status).toBe('current');
    expect(renterTripTimeline('requested').some((step) => /not locked/i.test(step.detail))).toBe(true);
    expect(renterTripTimeline('cancellation_requested').find((step) => step.id === 'resolution')?.status).toBe('current');
    expect(renterTripTimeline('confirmed').find((step) => step.id === 'owner')?.status).toBe('complete');
    expect(renterTripTimeline('confirmed').find((step) => step.id === 'owner')?.label).toBe('Reservation confirmed');
    expect(renterTripTimeline('checkout_pending').find((step) => step.id === 'owner')?.label).toBe('Reservation confirmation');
    expect(tripStateCopy('intent_created').label).toBe('Dates held');
    expect(renterTripTimeline('in_progress').find((step) => step.id === 'journey')?.status).toBe('current');
    expect(renterTripTimeline('completed').find((step) => step.id === 'journey')?.status).toBe('complete');
    expect(renterTripTimeline('refunded').find((step) => step.id === 'resolution')?.status).toBe('complete');
  });

  it('groups preview journeys into scannable active, upcoming, intervention, and past sections', () => {
    const sections = groupTripsForDisplay(previewRenterTrips);
    expect(sections.map((section) => section.label)).toEqual([
      'Active requests',
      'Upcoming',
      'Needs attention',
      'Past',
    ]);
    expect(sections.find((section) => section.group === 'active')?.trips.some((trip) => trip.state === 'in_progress')).toBe(true);
    expect(sections.find((section) => section.group === 'upcoming')?.trips.every((trip) => trip.state === 'confirmed')).toBe(true);
  });
});
