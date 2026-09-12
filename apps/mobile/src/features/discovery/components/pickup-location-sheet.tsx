import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, radii, spacing, typography } from '@mmg/brand';
import { useState } from 'react';
import {
  ActivityIndicator,
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
  type PickupLocation,
} from '../domain/pickup-location';
import { useCurrentLocation } from '../hooks/use-current-location';
import { usePlaceSearch } from '../hooks/use-place-search';

export type PickupLocationSheetProps = {
  visible: boolean;
  selectedLocation?: PickupLocation | null;
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
  const { results: searchResults, isLoading: searching, error: searchError } = usePlaceSearch(query);
  const { requestCurrentLocation, status: currentLocStatus, errorMessage: currentLocError, reset: resetCurrentLoc } = useCurrentLocation();

  const handleSelect = (loc: PickupLocation) => {
    onSelectLocation(loc);
    handleDismiss();
  };

  const handleDismiss = () => {
    setQuery('');
    resetCurrentLoc();
    onClose();
  };

  const handleCurrentLocationPress = async () => {
    const result = await requestCurrentLocation();
    if (result.success) {
      handleSelect(result.location);
    }
  };

  const isSelected = (loc: PickupLocation) => {
    if (!selectedLocation) return false;
    if (selectedLocation.placeId && loc.placeId) {
      return selectedLocation.placeId === loc.placeId;
    }
    return (
      selectedLocation.displayName.toLowerCase() === loc.displayName.toLowerCase() ||
      selectedLocation.formattedAddress.toLowerCase() === loc.formattedAddress.toLowerCase()
    );
  };

  const bannerError = currentLocError || searchError;

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

            {/* Error Banner */}
            {bannerError ? (
              <View style={styles.errorBox}>
                <Ionicons color={colors.danger} name="alert-circle" size={16} />
                <Text style={styles.errorText}>{bannerError}</Text>
              </View>
            ) : null}

            {/* Choice 1: Use my current location */}
            <PressableScale
              accessibilityLabel="Use my current location"
              accessibilityRole="button"
              disabled={currentLocStatus === 'requesting'}
              onPress={handleCurrentLocationPress}
              style={styles.currentLocationRow}
            >
              <View style={styles.currentLocationIconBox}>
                {currentLocStatus === 'requesting' ? (
                  <ActivityIndicator color={colors.goldStrong} size="small" />
                ) : (
                  <Ionicons color={colors.goldStrong} name="navigate-circle-outline" size={22} />
                )}
              </View>
              <View style={styles.currentLocationCopy}>
                <Text style={styles.currentLocationTitle}>Use my current location</Text>
                <Text style={styles.currentLocationSub}>
                  {currentLocStatus === 'requesting'
                    ? 'Detecting your Lagos location…'
                    : 'We will bring the vehicle directly to you in Lagos'}
                </Text>
              </View>
              <Ionicons color={colors.muted} name="chevron-forward" size={16} />
            </PressableScale>

            {/* Choice 2: Search Lagos landmarks */}
            <View style={styles.searchContainer}>
              <Ionicons color={colors.muted} name="search-outline" size={18} style={styles.searchIcon} />
              <TextInput
                accessibilityLabel="Search Lagos landmark"
                autoCorrect={false}
                clearButtonMode="while-editing"
                onChangeText={setQuery}
                placeholder="Search Lagos landmark (e.g. Eko Hotel, MMA Airport)..."
                placeholderTextColor={colors.muted}
                style={styles.searchInput}
                value={query}
              />
              {searching ? (
                <ActivityIndicator color={colors.goldStrong} size="small" style={{ marginLeft: spacing.xs }} />
              ) : query ? (
                <Pressable onPress={() => setQuery('')} style={{ padding: 4 }}>
                  <Ionicons color={colors.muted} name="close-circle" size={16} />
                </Pressable>
              ) : null}
            </View>

            {/* Section Header */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeaderTitle}>
                {query.trim().length > 0 ? 'Matching Landmarks' : 'Suggested Lagos Landmarks'}
              </Text>
            </View>

            {/* Choice 3: Suggested / Search Results List */}
            <ScrollView
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {searchResults.length === 0 ? (
                <View style={styles.emptyResultsBox}>
                  <Ionicons color={colors.muted} name="location-outline" size={24} />
                  <Text style={styles.emptyResultsText}>No Lagos landmarks match this search.</Text>
                </View>
              ) : (
                searchResults.map((item) => {
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
                })
              )}
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
  currentLocationCopy: {
    flex: 1,
  },
  currentLocationIconBox: {
    alignItems: 'center',
    backgroundColor: colors.graphiteRaised,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  currentLocationRow: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  currentLocationSub: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  currentLocationTitle: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.sm,
  },
  emptyResultsBox: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xl,
  },
  emptyResultsText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.xs,
  },
  errorBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: colors.danger,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  errorText: {
    color: colors.danger,
    flex: 1,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.xs,
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
    minHeight: 54,
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
    maxHeight: 340,
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
    marginBottom: spacing.sm,
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
  sectionHeaderRow: {
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
  },
  sectionHeaderTitle: {
    color: colors.muted,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.xs,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  sheet: {
    backgroundColor: colors.canvas,
    borderTopColor: colors.lineStrong,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderTopWidth: 1,
    maxHeight: '90%',
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
