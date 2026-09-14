import { describe, expect, it } from 'vitest';

import { ownerBookingsLoadPresentation } from './owner-bookings-load-state';

describe('owner bookings load state', () => {
  it('keeps a rental-request failure visible after bookings succeed', () => {
    expect(ownerBookingsLoadPresentation({
      requestsLoading: false,
      bookingsLoading: false,
      requestsError: 'Rental requests could not be loaded.',
      bookingsError: null,
    })).toEqual({
      loading: false,
      errors: ['Rental requests could not be loaded.'],
    });
  });

  it('keeps a booking subscription failure visible after requests succeed', () => {
    expect(ownerBookingsLoadPresentation({
      requestsLoading: false,
      bookingsLoading: false,
      requestsError: null,
      bookingsError: 'Bookings could not be loaded.',
    })).toEqual({
      loading: false,
      errors: ['Bookings could not be loaded.'],
    });
  });

  it('reports loading while either independent source is still loading', () => {
    expect(ownerBookingsLoadPresentation({
      requestsLoading: true,
      bookingsLoading: false,
      requestsError: null,
      bookingsError: null,
    }).loading).toBe(true);

    expect(ownerBookingsLoadPresentation({
      requestsLoading: false,
      bookingsLoading: true,
      requestsError: null,
      bookingsError: null,
    }).loading).toBe(true);
  });

  it('preserves both failures when both sources fail', () => {
    expect(ownerBookingsLoadPresentation({
      requestsLoading: false,
      bookingsLoading: false,
      requestsError: 'Requests failed.',
      bookingsError: 'Bookings failed.',
    }).errors).toEqual(['Requests failed.', 'Bookings failed.']);
  });
});
