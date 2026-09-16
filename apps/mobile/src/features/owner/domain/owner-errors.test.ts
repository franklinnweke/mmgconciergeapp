import { describe, expect, it } from 'vitest';

import { mapVehicleListingError, ownerCommandErrorMessage } from './owner-errors';

describe('mapVehicleListingError', () => {
  it('preserves exact image dimension error messages without converting to photo-presence banner', () => {
    const errorMsg = 'Listing photos must be at least 1280×720 pixels. This one is 1024×768.';
    expect(mapVehicleListingError(new Error(errorMsg))).toBe(errorMsg);
  });

  it('preserves error messages mentioning resolution or pixels', () => {
    const errorMsg = 'Photo resolution is too low (1024×768). Listing photos must be at least 1280×720 pixels.';
    expect(mapVehicleListingError(new Error(errorMsg))).toBe(errorMsg);
  });

  it('maps listing_incomplete to add and upload photo banner', () => {
    expect(mapVehicleListingError(new Error('listing_incomplete: complete all details'))).toBe(
      'Please add and upload at least one vehicle photo before submitting for review.',
    );
  });

  it('maps not_approved_owner to approval required message', () => {
    expect(mapVehicleListingError(new Error('not_approved_owner'))).toBe(
      'Your owner verification must be approved before you can list a vehicle.',
    );
  });

  it('maps unauthenticated error cleanly', () => {
    expect(mapVehicleListingError(new Error('unauthenticated'))).toBe(
      'Please sign in to list your vehicle.',
    );
  });

  it('returns fallback for unknown errors', () => {
    expect(mapVehicleListingError(new Error('Some unexpected network failure'))).toBe(
      'Failed to submit vehicle listing. Please check the vehicle details and try again.',
    );
  });
});

describe('ownerCommandErrorMessage', () => {
  it('maps unauthenticated', () => {
    expect(ownerCommandErrorMessage({ details: { code: 'UNAUTHENTICATED' } })).toBe('Sign in to continue.');
  });
});
