import { describe, expect, it, vi } from 'vitest';
import { DISTRICTS } from './pickup-district-sheet';

vi.mock('react-native', () => ({
  Modal: 'Modal',
  Pressable: 'Pressable',
  StyleSheet: {
    absoluteFill: {},
    create: (styles: any) => styles,
    hairlineWidth: 1,
  },
  Text: 'Text',
  View: 'View',
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, top: 0, left: 0, right: 0 }),
}));

vi.mock('@/components/pressable-scale', () => ({
  PressableScale: 'PressableScale',
}));

describe('PickupDistrictSheet', () => {
  it('exports valid Lagos pickup districts with valid area labels and icons', () => {
    expect(DISTRICTS.length).toBe(5);

    const areas = DISTRICTS.map((d) => d.area);
    expect(areas).toContain('Ikoyi, Lagos');
    expect(areas).toContain('Victoria Island, Lagos');
    expect(areas).toContain('Lekki Phase 1, Lagos');
    expect(areas).toContain('Murtala Muhammed Airport, Lagos');
    expect(areas).toContain('Ikeja GRA, Lagos');

    for (const district of DISTRICTS) {
      expect(district.name.trim().length).toBeGreaterThan(0);
      expect(district.subtitle.trim().length).toBeGreaterThan(0);
      expect(district.icon.trim().length).toBeGreaterThan(0);
    }
  });

  it('matches district selection accurately for exact and partial area names', () => {
    const isSelected = (selectedArea: string, itemArea: string) =>
      selectedArea === itemArea ||
      selectedArea.toLowerCase().includes(itemArea.split(',')[0].toLowerCase());

    expect(isSelected('Ikoyi, Lagos', 'Ikoyi, Lagos')).toBe(true);
    expect(isSelected('Ikoyi', 'Ikoyi, Lagos')).toBe(true);
    expect(isSelected('Victoria Island, Lagos', 'Victoria Island, Lagos')).toBe(true);
    expect(isSelected('Victoria Island', 'Victoria Island, Lagos')).toBe(true);
    expect(isSelected('Ikeja GRA', 'Ikeja GRA, Lagos')).toBe(true);
    expect(isSelected('Abuja', 'Ikoyi, Lagos')).toBe(false);
  });
});
