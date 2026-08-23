import * as Haptics from 'expo-haptics';
import { PropsWithChildren, useState } from 'react';
import {
  Animated,
  GestureResponderEvent,
  Platform,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from 'react-native';

type PressableScaleProps = PropsWithChildren<
  Omit<PressableProps, 'style'> & {
    haptic?: 'light' | 'selection' | false;
    style?: StyleProp<ViewStyle>;
  }
>;

export function PressableScale({
  children,
  haptic = false,
  onBlur,
  onFocus,
  onPressIn,
  onPressOut,
  style,
  ...props
}: PressableScaleProps) {
  const [scale] = useState(() => new Animated.Value(1));
  const [focused, setFocused] = useState(false);

  function animateTo(value: number) {
    Animated.spring(scale, {
      damping: 18,
      mass: 0.55,
      stiffness: 260,
      toValue: value,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }

  function handlePressIn(event: GestureResponderEvent) {
    animateTo(0.985);
    if (haptic === 'selection') {
      void Haptics.selectionAsync().catch(() => undefined);
    } else if (haptic === 'light') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }
    onPressIn?.(event);
  }

  function handlePressOut(event: GestureResponderEvent) {
    animateTo(1);
    onPressOut?.(event);
  }

  return (
    <Animated.View
      style={[
        style,
        { transform: [{ scale }] },
        Platform.OS === 'web' && focused
          ? { outlineColor: '#E3C365', outlineOffset: 3, outlineStyle: 'solid', outlineWidth: 2 }
          : null,
      ]}
    >
      <Pressable
        {...props}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
