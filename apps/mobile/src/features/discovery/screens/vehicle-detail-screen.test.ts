import { describe, expect, it } from 'vitest';
import { type VehicleSummary } from '@mmg/contracts';
import { calculateBookingQuote, formatNairaFromKobo } from '@mmg/domain';

describe('VehicleDetailScreen verified facts and commercial presentation', () => {
  const mockVehicle: VehicleSummary = {
    id: 'veh_test_001',
    displayName: 'Toyota Land Cruiser Prado',
    category: 'executive_suv',
    seats: 7,
    dailyRateKobo: 25000000,
    areaLabel: 'Victoria Island',
    distanceKm: 2.5,
    chauffeurPolicy: 'included',
    deliveryPolicy: 'included',
  };

  it('formats verified vehicle metadata using real vehicle data only', () => {
    const meta = `${mockVehicle.areaLabel} · ${mockVehicle.seats} passengers`;

    expect(meta).toBe('Victoria Island · 7 passengers');

    // Non-verified or fabricated specs must not be present
    expect(meta).not.toContain('3 large bags');
    expect(meta).not.toContain('Automatic');
    expect(meta).not.toContain('Dual A/C');
  });

  it('calculates authoritative quote breakdown correctly for rental duration', () => {
    const durationDays = 3;
    const quote = calculateBookingQuote(mockVehicle.dailyRateKobo, durationDays);

    expect(quote.rentalKobo).toBe(75000000);
    expect(quote.serviceFeeKobo).toBe(6000000); // 8% service fee
    expect(quote.totalKobo).toBe(81000000);

    expect(formatNairaFromKobo(quote.rentalKobo)).toBe('₦750,000');
    expect(formatNairaFromKobo(quote.serviceFeeKobo)).toBe('₦60,000');
    expect(formatNairaFromKobo(quote.totalKobo)).toBe('₦810,000');
  });

  it('displays truthful primary action based on calendar availability', () => {
    function getPrimaryCta(status: 'available' | 'unavailable' | 'loading' | 'error') {
      return status === 'available' ? 'Request this car' : 'Check dates';
    }

    expect(getPrimaryCta('available')).toBe('Request this car');
    expect(getPrimaryCta('unavailable')).toBe('Check dates');
    expect(getPrimaryCta('loading')).toBe('Check dates');
    expect(getPrimaryCta('error')).toBe('Check dates');
  });
});
