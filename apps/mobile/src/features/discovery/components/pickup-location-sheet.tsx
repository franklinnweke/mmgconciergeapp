import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, radii, spacing, typography } from '@mmg/brand';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import {
  isPickupLocationServiceable,
  searchPickupLocations,
  type PickupLocation,
} from '../domain/pickup-location';

export type PickupLocationSheetProps = {
  visible: boolean;
  selectedLocation: PickupLocation;
  onSelectLocation(location: PickupLocation): void;
  onClose(): void;
};

function getIconForLocation(location: PickupLocation): keyof typeof Ionicons.glyphMap {
  const name = location.displayName.toLowerCase();
  if (name.includes('airport') || name.includes('execujet') || name.includes('terminal')) {
    return 'airplane-outline';
  }
  if (name.includes('hotel') || name.includes('suites') || name.includes('wheatbaker')) {
    return 'bed-outline';
  }
  if (name.includes('centre') || name.includes('civic') || name.includes('hall')) {
    return 'business-outline';
  }
  if (name.includes('island') || name.includes('banana')) {
    return 'shield-checkmark-outline';
  }
  return 'location-outline';
}

export function PickupLocationSheet({
  visible,
  selectedLocation,
  onSelectLocation,
  onClose,
}: PickupLocationSheetProps) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const searchResults = useMemo(() => {
    return searchPickupLocations(query);
  }, [query]);

  const handleSelect = (loc: PickupLocation) => {
    onSelectLocation(loc);
    onClose();
  };

  const handleDismiss = () => {
    setQuery('');
    onClose();
  };

  const isSelected = (loc: PickupLocation) => {
    if (selectedLocation.placeId && loc.placeId) {
      return selectedLocation.placeId === loc.placeId;
    }
    return (
      selectedLocation.displayName.toLowerCase() === loc.displayName.toLowerCase() ||
      selectedLocation.formattedAddress.toLowerCase() === loc.formattedAddress.toLowerCase()
    );
  };

  return (
    <Modal
      accessibilityViewIsModal
      animationType="fade"
      onRequestClose={handleDismiss}
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel="Dismiss location selection"
          accessibilityRole="button"
          onPress={handleDismiss}
          style={StyleSheet.absoluteFill}
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardContainer}
        >
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerTitleGroup}>
                <Text accessibilityRole="header" style={styles.title}>
                  Where should we bring the car?
                </Text>
                <Text style={styles.subtitle}>
                  Chauffeured delivery anywhere in Lagos
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Close location selection"
                accessibilityRole="button"
                onPress={handleDismiss}
                style={styles.closeButton}
              >
                <Ionicons color={colors.ivory} name="close" size={18} />
              </Pressable>
            </View>

            {/* Search Input */}
            <View style={styles.searchContainer}>
              <Ionicons color={colors.muted} name="search-outline" size={18} style={styles.searchIcon} />
              <TextInput
                accessibilityLabel="Search address, hotel, or landmark"
                autoCorrect={false}
                clearButtonMode="while-editing"
                onChangeText={setQuery}
                placeholder="Search address, hotel, or landmark..."
                placeholderTextColor={colors.muted}
                style={styles.searchInput}
                value={query}
              />
            </View>

            {/* List */}
            <ScrollView
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {searchResults.map((item) => {
                const active = isSelected(item);
                const serviceable = isPickupLocationServiceable(item);
                const icon = getIconForLocation(item);

                return (
                  <PressableScale
                    accessibilityHint={serviceable ? 'Selects this delivery location' : 'Location is outside Lagos service area'}
                    accessibilityLabel={`${item.displayName}, ${item.formattedAddress}${active ? ', selected' : ''}`}
                    accessibilityRole="button"
                    key={item.placeId ?? item.formattedAddress}
                    onPress={() => handleSelect(item)}
                    style={[styles.itemRow, active && styles.itemRowActive]}
                  >
                    <View style={[styles.itemIcon, active && styles.itemIconActive]}>
                      <Ionicons
                        color={active ? colors.canvas : colors.goldStrong}
                        name={icon}
                        size={18}
                      />
                    </View>

                    <View style={styles.itemCopy}>
                      <Text numberOfLines={1} style={[styles.itemName, active && styles.itemNameActive]}>
                        {item.displayName}
                      </Text>
                      <Text numberOfLines={1} style={styles.itemSub}>
                        {item.formattedAddress}
                      </Text>
                    </View>

                    {active ? (
                      <Ionicons color={colors.goldStrong} name="checkmark-circle" size={20} />
                    ) : (
                      <Ionicons color={colors.muted} name="chevron-forward" size={16} />
                    )}
                  </PressableScale>
                );
              })}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  closeButton: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.lineStrong,
    borderRadius: radii.pill,
    height: 4,
    marginBottom: spacing.md,
    width: 36,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  headerTitleGroup: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  itemCopy: {
    flex: 1,
  },
  itemIcon: {
    alignItems: 'center',
    backgroundColor: colors.graphiteRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  itemIconActive: {
    backgroundColor: colors.goldStrong,
    borderColor: colors.goldStrong,
  },
  itemName: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.sm,
  },
  itemNameActive: {
    color: colors.goldStrong,
  },
  itemRow: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 58,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  itemRowActive: {
    borderColor: colors.goldStrong,
  },
  itemSub: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  keyboardContainer: {
    justifyContent: 'flex-end',
    width: '100%',
  },
  list: {
    gap: spacing.xs,
    maxHeight: 380,
    paddingBottom: spacing.sm,
  },
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.72)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  searchContainer: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    color: colors.ivory,
    flex: 1,
    fontFamily: typography.body,
    fontSize: fontSizes.sm,
    height: 44,
  },
  sheet: {
    backgroundColor: colors.canvas,
    borderTopColor: colors.lineStrong,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderTopWidth: 1,
    maxHeight: '85%',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  subtitle: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: fontSizes.lg,
    letterSpacing: -0.3,
  },
});
