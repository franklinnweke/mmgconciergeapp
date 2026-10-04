import * as Haptics from 'expo-haptics';
import { PropsWithChildren, useState } from 'react';
import {
  GestureResponderEvent,
  Platform,
  Pressable,
  PressableProps,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native';

type PressableScaleProps = PropsWithChildren<
  Omit<PressableProps, 'style'> & {
    haptic?: boolean;
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
  const [focused, setFocused] = useState(false);


  function handlePressIn(event: GestureResponderEvent) {
    if (haptic) void Haptics.selectionAsync().catch(() => undefined);
    onPressIn?.(event);
  }

  function handlePressOut(event: GestureResponderEvent) {
    onPressOut?.(event);
  }

  return (
    <View
      style={[
        style,
        Platform.OS === 'web' && focused
          ? { outlineColor: '#E3C365', outlineOffset: 3, outlineStyle: 'solid', outlineWidth: 2 }
          : null,
      ]}
    >
      <Pressable
        {...props}
        style={({ pressed }) => ({ opacity: pressed && !props.disabled ? 0.8 : 1 })}
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
    </View>
  );
}
