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
    style?: StyleProp<ViewStyle>;
  }
>;

export function PressableScale({ children, onPressIn, onPressOut, style, ...props }: PressableScaleProps) {
  const [scale] = useState(() => new Animated.Value(1));

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
    animateTo(0.975);
    void Haptics.selectionAsync().catch(() => undefined);
    onPressIn?.(event);
  }

  function handlePressOut(event: GestureResponderEvent) {
    animateTo(1);
    onPressOut?.(event);
  }

  return (
    <Animated.View style={[style, { transform: [{ scale }] }]}>
      <Pressable {...props} onPressIn={handlePressIn} onPressOut={handlePressOut}>
        {children}
      </Pressable>
    </Animated.View>
  );
}
