import { describe, expect, it } from 'vitest';
import { type VehicleCategory } from '@mmg/contracts';
import { type PickupLocation } from '../domain/pickup-location';

function formatQuietContext({
  category,
  pickup,
  query,
}: {
  category?: VehicleCategory;
  pickup?: PickupLocation | null;
  query?: string;
}): string {
  const parts: string[] = [];
  if (category) {
    parts.push(category === 'executive_suv' ? 'SUV' : 'Sedan');
  }
  if (pickup) {
    parts.push(`${pickup.displayName} pickup`);
  }
  if (query?.trim()) {
    parts.push(`“${query.trim()}”`);
  }
  return parts.join(' · ');
}

describe('BrowseFleetScreen quiet context', () => {
  const mockPickup: PickupLocation = {
    displayName: 'Ikoyi & Banana Island',
    formattedAddress: 'Ikoyi, Lagos, Nigeria',
    latitude: 6.4549,
    longitude: 3.4402,
    serviceAreaLabel: 'Ikoyi',
    source: 'suggested',
  };

  it('formats category and pickup context together quietly', () => {
    const context = formatQuietContext({
      category: 'executive_suv',
      pickup: mockPickup,
    });
    expect(context).toBe('SUV · Ikoyi & Banana Island pickup');
  });

  it('formats category only when pickup is not selected', () => {
    const context = formatQuietContext({
      category: 'executive_sedan',
      pickup: null,
    });
    expect(context).toBe('Sedan');
  });

  it('formats pickup only when category is not filtered', () => {
    const context = formatQuietContext({
      pickup: mockPickup,
    });
    expect(context).toBe('Ikoyi & Banana Island pickup');
  });

  it('includes query in context when user types a search term', () => {
    const context = formatQuietContext({
      category: 'executive_suv',
      pickup: mockPickup,
      query: 'Prado',
    });
    expect(context).toBe('SUV · Ikoyi & Banana Island pickup · “Prado”');
  });

  it('returns empty string when no filters or search query are active', () => {
    const context = formatQuietContext({
      pickup: null,
      query: '',
    });
    expect(context).toBe('');
  });
});
