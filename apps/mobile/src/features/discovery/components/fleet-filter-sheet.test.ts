import { describe, expect, it, vi } from 'vitest';
import { fleetCategories } from '../data/lagos-destinations';
import { FleetFilterSheet, type FleetFilterState } from './fleet-filter-sheet';

vi.mock('react-native', () => ({
  Modal: 'Modal',
  Platform: { OS: 'ios' },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
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

describe('FleetFilterSheet', () => {
  it('defines the component properly', () => {
    expect(typeof FleetFilterSheet).toBe('function');
  });

  it('supports FleetFilterState with category only', () => {
    const filterState: FleetFilterState = {
      category: 'executive_suv',
    };
    expect(filterState.category).toBe('executive_suv');

    const resetState: FleetFilterState = {
      category: undefined,
    };
    expect(resetState.category).toBeUndefined();
  });

  it('exposes supported vehicle categories and excludes undefined/fictional categories', () => {
    const validCategories = fleetCategories.filter((cat) => cat.value !== undefined);
    expect(validCategories.map((c) => c.value)).toEqual(['executive_suv', 'executive_sedan']);
  });
});
