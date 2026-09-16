import { describe, expect, it, vi } from 'vitest';
import { PressableScale } from './pressable-scale';

vi.mock('react-native', () => ({
  Animated: {
    Value: vi.fn(() => ({
      setValue: vi.fn(),
    })),
    spring: vi.fn(() => ({
      start: vi.fn(),
    })),
    createAnimatedComponent: (comp: any) => comp,
  },
  Platform: { OS: 'ios' },
  Pressable: 'Pressable',
  StyleSheet: {
    create: (styles: any) => styles,
    hairlineWidth: 1,
  },
}));

vi.mock('expo-haptics', () => ({
  selectionAsync: vi.fn(),
}));

describe('PressableScale', () => {
  it('exports a valid React functional component', () => {
    expect(typeof PressableScale).toBe('function');
  });
});
