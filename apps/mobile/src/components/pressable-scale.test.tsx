import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import { PressableScale } from './pressable-scale';

vi.mock('react-native', () => ({
  View: 'View', Pressable: 'Pressable', Platform: { OS: 'web' },
}));
vi.mock('expo-haptics', () => ({ selectionAsync: vi.fn(async () => undefined) }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('shared restrained press feedback', () => {
  it('retains accessibility, actions and quiet feedback without animated transforms', async () => {
    const onPress = vi.fn();
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<PressableScale accessibilityLabel="Continue" accessibilityRole="button" onPress={onPress}>Continue</PressableScale>);
    });
    const button = renderer!.root.findByType('Pressable' as never);
    expect(button.props.accessibilityLabel).toBe('Continue');
    expect(button.props.style({ pressed: true })).toEqual({ opacity: 0.8 });
    expect(button.props.style({ pressed: false })).toEqual({ opacity: 1 });
    button.props.onPress();
    expect(onPress).toHaveBeenCalledOnce();
    expect(renderer!.root.findByType('View' as never).props.style.flat().some((style: Record<string, unknown> | null) => style?.transform)).toBe(false);
    await act(async () => renderer!.unmount());
  });

  it('does not visually advertise a disabled press', async () => {
    let renderer: ReturnType<typeof create>;
    await act(async () => { renderer = create(<PressableScale disabled>Continue</PressableScale>); });
    const button = renderer!.root.findByType('Pressable' as never);
    expect(button.props.disabled).toBe(true);
    expect(button.props.style({ pressed: true })).toEqual({ opacity: 1 });
    await act(async () => renderer!.unmount());
  });
});
