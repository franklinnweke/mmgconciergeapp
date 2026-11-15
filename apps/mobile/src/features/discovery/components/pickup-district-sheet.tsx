import { Ionicons } from '@expo/vector-icons';
import { fontSizes, radii, spacing, typography, type ThemeColors } from '@mmg/brand';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { useTheme, useThemeStyles } from '../../../core/theme';

export type PickupDistrictSheetProps = {
  visible: boolean;
  selectedArea: string;
  onSelectArea(area: string): void;
  onClose(): void;
};

export const DISTRICTS: {
  area: string;
  name: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    area: 'Ikoyi, Lagos',
    name: 'Ikoyi & Banana Island',
    subtitle: 'Old Ikoyi, Banana Island, Parkview, Osborne Foreshore',
    icon: 'shield-checkmark-outline',
  },
  {
    area: 'Victoria Island, Lagos',
    name: 'Victoria Island & Eko Atlantic',
    subtitle: 'Adeola Odeku, Ahmadu Bello, Victoria Island Business District',
    icon: 'business-outline',
  },
  {
    area: 'Lekki Phase 1, Lagos',
    name: 'Lekki Phase 1 & Peninsula',
    subtitle: 'Admiralty Way, Freedom Way, Lekki Expressway corridor',
    icon: 'water-outline',
  },
  {
    area: 'Murtala Muhammed Airport, Lagos',
    name: 'Murtala Muhammed Airport (LOS)',
    subtitle: 'International Terminal, MMA2, Private Executive Jet Terminal',
    icon: 'airplane-outline',
  },
  {
    area: 'Ikeja GRA, Lagos',
    name: 'Ikeja GRA & Mainland',
    subtitle: 'Isaac John, Joel Ogunnaike, Government House corridor',
    icon: 'location-outline',
  },
];

export function PickupDistrictSheet({
  visible,
  selectedArea,
  onSelectArea,
  onClose,
}: PickupDistrictSheetProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);

  return (
    <Modal
      accessibilityViewIsModal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel="Dismiss district selection"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleGroup}>
              <Text style={styles.eyebrow}>LAGOS DISPATCH</Text>
              <Text accessibilityRole="header" style={styles.title}>
                Select Pickup Region
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close district selection"
              accessibilityRole="button"
              onPress={onClose}
              style={styles.closeButton}
            >
              <Ionicons color={colors.ivory} name="close" size={18} />
            </Pressable>
          </View>

          {/* District list */}
          <View style={styles.list}>
            {DISTRICTS.map((item) => {
              const isSelected =
                selectedArea === item.area ||
                selectedArea.toLowerCase().includes(item.area.split(',')[0].toLowerCase());

              return (
                <PressableScale
                  accessibilityLabel={`${item.name}. ${item.subtitle}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  key={item.area}
                  onPress={() => {
                    onSelectArea(item.area);
                    onClose();
                  }}
                >
                  <View style={[styles.itemRow, isSelected && styles.itemRowActive]}>
                    <View style={[styles.itemIcon, isSelected && styles.itemIconActive]}>
                      <Ionicons
                        color={isSelected ? colors.primaryContrast : colors.goldStrong}
                        name={item.icon}
                        size={20}
                      />
                    </View>
                    <View style={styles.itemCopy}>
                      <Text style={[styles.itemName, isSelected && styles.itemNameActive]}>
                        {item.name}
                      </Text>
                      <Text style={styles.itemSub}>{item.subtitle}</Text>
                    </View>
                    {isSelected ? (
                      <Ionicons color={colors.goldStrong} name="checkmark-circle" size={20} />
                    ) : (
                      <Ionicons color={colors.textMuted} name="chevron-forward" size={16} />
                    )}
                  </View>
                </PressableScale>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = ({ colors }: { colors: ThemeColors }) =>
  StyleSheet.create({
    closeButton: {
      alignItems: 'center',
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.borderStrong,
      borderRadius: radii.pill,
      borderWidth: StyleSheet.hairlineWidth,
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    eyebrow: {
      color: colors.goldStrong,
      fontFamily: typography.bodySemiBold,
      fontSize: fontSizes.xs,
      letterSpacing: 1.2,
    },
    handle: {
      alignSelf: 'center',
      backgroundColor: colors.borderStrong,
      borderRadius: 2,
      height: 4,
      marginBottom: spacing.md,
      width: 36,
    },
    header: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    headerTitleGroup: {
      flex: 1,
    },
    itemCopy: {
      flex: 1,
    },
    itemIcon: {
      alignItems: 'center',
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.borderStrong,
      borderRadius: radii.pill,
      borderWidth: StyleSheet.hairlineWidth,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    itemIconActive: {
      backgroundColor: colors.goldStrong,
      borderColor: colors.goldStrong,
    },
    itemName: {
      color: colors.textPrimary,
      fontFamily: typography.bodySemiBold,
      fontSize: fontSizes.base,
    },
    itemNameActive: {
      color: colors.goldStrong,
    },
    itemRow: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: spacing.md,
      minHeight: 64,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    itemRowActive: {
      borderColor: colors.goldStrong,
    },
    itemSub: {
      color: colors.textMuted,
      fontFamily: typography.body,
      fontSize: fontSizes.xs,
      marginTop: 2,
    },
    list: {
      gap: spacing.xs,
    },
    overlay: {
      backgroundColor: colors.scrim,
      flex: 1,
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.canvas,
      borderTopColor: colors.borderStrong,
      borderTopLeftRadius: radii.xl,
      borderTopRightRadius: radii.xl,
      borderTopWidth: 1,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
    title: {
      color: colors.textPrimary,
      fontFamily: typography.display,
      fontSize: fontSizes.xl,
      letterSpacing: -0.3,
      marginTop: 2,
    },
  });
