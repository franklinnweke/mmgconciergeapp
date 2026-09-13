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
import { type PickupLocation, deriveLagosAreaLabel } from '../domain/pickup-location';
import { useCurrentLocation } from '../hooks/use-current-location';
import { usePlaceSearch, type PlaceSuggestion } from '../hooks/use-place-search';
import { PickupPinMap } from './pickup-pin-map';

export type PickupLocationSheetProps = {
  visible: boolean;
  selectedLocation?: PickupLocation | null;
  onSelectLocation(location: PickupLocation): void;
  onClose(): void;
};

export function PickupLocationSheet({
  visible,
  selectedLocation,
  onSelectLocation,
  onClose,
}: PickupLocationSheetProps) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [pendingLocation, setPendingLocation] = useState<PickupLocation | null>(null);
  const [initialCoords, setInitialCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [note, setNote] = useState('');
  const [resolvingPlaceId, setResolvingPlaceId] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const { suggestions, isLoading: searching, error: searchError, resolvePlace } = usePlaceSearch(query);
  const { requestCurrentLocation, status: currentLocStatus, errorMessage: currentLocError, reset: resetCurrentLoc } = useCurrentLocation();

  const handleDismiss = () => {
    setQuery('');
    setPendingLocation(null);
    setInitialCoords(null);
    setNote('');
    setResolveError(null);
    resetCurrentLoc();
    onClose();
  };

  const handleConfirm = () => {
    if (!pendingLocation) return;
    const finalLocation: PickupLocation = {
      ...pendingLocation,
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    onSelectLocation(finalLocation);
    handleDismiss();
  };

  const handleSelectSuggestion = async (item: PlaceSuggestion) => {
    setResolveError(null);
    if (item.isCurated && item.location) {
      setPendingLocation(item.location);
      setInitialCoords({ latitude: item.location.latitude, longitude: item.location.longitude });
      setNote(item.location.note ?? (isSelected(item.location) ? (selectedLocation?.note ?? '') : ''));
      return;
    }

    setResolvingPlaceId(item.placeId);
    try {
      const loc = await resolvePlace(item);
      setPendingLocation(loc);
      setInitialCoords({ latitude: loc.latitude, longitude: loc.longitude });
      setNote(isSelected(loc) ? (selectedLocation?.note ?? '') : '');
    } catch (err: unknown) {
      setResolveError(err instanceof Error ? err.message : 'Could not resolve pickup location.');
    } finally {
      setResolvingPlaceId(null);
    }
  };

  const handleCurrentLocationPress = async () => {
    setResolveError(null);
    const result = await requestCurrentLocation();
    if (result.success) {
      setPendingLocation(result.location);
      setInitialCoords({ latitude: result.location.latitude, longitude: result.location.longitude });
      setNote(selectedLocation?.note ?? '');
    }
  };

  const handlePinCoordinateChange = (coords: { latitude: number; longitude: number }) => {
    if (!pendingLocation) return;
    const newArea = deriveLagosAreaLabel({ lat: coords.latitude, lng: coords.longitude });
    setPendingLocation({
      ...pendingLocation,
      latitude: coords.latitude,
      longitude: coords.longitude,
      source: 'pin_adjusted',
      serviceAreaLabel: newArea ?? pendingLocation.serviceAreaLabel,
    });
  };

  const handleResetPin = () => {
    if (!pendingLocation || !initialCoords) return;
    const newArea = deriveLagosAreaLabel({ lat: initialCoords.latitude, lng: initialCoords.longitude });
    setPendingLocation({
      ...pendingLocation,
      latitude: initialCoords.latitude,
      longitude: initialCoords.longitude,
      source: pendingLocation.placeId ? 'place_search' : 'suggested',
      serviceAreaLabel: newArea ?? pendingLocation.serviceAreaLabel,
    });
  };

  const isSelected = (loc: PickupLocation | PlaceSuggestion) => {
    if (!selectedLocation) return false;
    if (selectedLocation.placeId && loc.placeId) {
      return selectedLocation.placeId === loc.placeId;
    }
    return (
      selectedLocation.displayName.toLowerCase() === loc.displayName.toLowerCase() ||
      selectedLocation.formattedAddress.toLowerCase() === loc.formattedAddress.toLowerCase()
    );
  };

  const bannerError = currentLocError || searchError || resolveError;

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

            {pendingLocation ? (
              <ScrollView
                bounces={false}
                contentContainerStyle={styles.confirmContainer}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.header}>
                  <PressableScale
                    accessibilityLabel="Back to search"
                    accessibilityRole="button"
                    onPress={() => {
                      setPendingLocation(null);
                      setInitialCoords(null);
                    }}
                    style={styles.backButton}
                  >
                    <Ionicons color={colors.ivory} name="arrow-back" size={18} />
                    <Text style={styles.backButtonText}>Change</Text>
                  </PressableScale>

                  <Pressable
                    accessibilityLabel="Close location selection"
                    accessibilityRole="button"
                    onPress={handleDismiss}
                    style={styles.closeButton}
                  >
                    <Ionicons color={colors.ivory} name="close" size={18} />
                  </Pressable>
                </View>

                <View style={styles.confirmHeaderCopy}>
                  <Text accessibilityRole="header" style={styles.title}>
                    Confirm pickup location
                  </Text>
                  <Text style={styles.subtitle}>
                    Review the address and add meeting instructions if needed
                  </Text>
                </View>

                <View style={styles.confirmedCard}>
                  <View style={styles.confirmedCopy}>
                    <Text style={styles.confirmedTitle}>{pendingLocation.displayName}</Text>
                    <Text style={styles.confirmedAddress}>{pendingLocation.formattedAddress}</Text>
                  </View>
                </View>

                <PickupPinMap
                  initialLatitude={initialCoords?.latitude}
                  initialLongitude={initialCoords?.longitude}
                  latitude={pendingLocation.latitude}
                  longitude={pendingLocation.longitude}
                  onCoordinatesChange={handlePinCoordinateChange}
                  onReset={handleResetPin}
                />

                <View style={styles.noteSection}>
                  <Text style={styles.noteLabel}>Entrance / meeting point note (optional)</Text>
                  <TextInput
                    accessibilityLabel="Entrance or meeting point note"
                    autoCapitalize="sentences"
                    maxLength={150}
                    onChangeText={setNote}
                    placeholder="e.g. Gate 3, North Lobby, or call security on arrival"
                    placeholderTextColor={colors.muted}
                    style={styles.noteInput}
                    value={note}
                  />
                </View>

                <PressableScale
                  accessibilityLabel="Confirm pickup location"
                  accessibilityRole="button"
                  onPress={handleConfirm}
                  style={styles.confirmButton}
                >
                  <Text style={styles.confirmButtonText}>Confirm pickup location</Text>
                </PressableScale>

                {pendingLocation.source === 'place_search' || pendingLocation.source === 'pin_adjusted' ? (
                  <View
                    accessibilityLabel="Powered by Google"
                    style={styles.attributionContainer}
                  >
                    <Text style={styles.attributionText}>Powered by Google</Text>
                  </View>
                ) : null}
              </ScrollView>
            ) : (
              <View>
                <View style={styles.header}>
                  <View style={styles.headerTitleGroup}>
                    <Text accessibilityRole="header" style={styles.title}>
                      Where should we bring the car?
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

                {bannerError ? (
                  <View style={styles.errorBox}>
                    <Ionicons color={colors.danger} name="alert-circle" size={16} />
                    <Text style={styles.errorText}>{bannerError}</Text>
                  </View>
                ) : null}

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
                        : 'Find your location automatically'}
                    </Text>
                  </View>
                </PressableScale>

                <View style={styles.searchContainer}>
                  <Ionicons color={colors.muted} name="search-outline" size={18} style={styles.searchIcon} />
                  <TextInput
                    accessibilityLabel="Search Lagos address or landmark"
                    autoCorrect={false}
                    clearButtonMode="while-editing"
                    onChangeText={setQuery}
                    placeholder="Search Lagos address or landmark..."
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

                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionHeaderTitle}>
                    {query.trim().length > 0 ? 'Matching locations' : 'Suggested Lagos landmarks'}
                  </Text>
                </View>

                <ScrollView
                  contentContainerStyle={styles.list}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {suggestions.length === 0 ? (
                    <View style={styles.emptyResultsBox}>
                      <Ionicons color={colors.muted} name="location-outline" size={24} />
                      <Text style={styles.emptyResultsText}>No Lagos landmarks match this search.</Text>
                    </View>
                  ) : (
                    suggestions.map((item) => {
                      const active = isSelected(item);
                      const isResolving = resolvingPlaceId === item.placeId;

                      return (
                        <PressableScale
                          accessibilityHint="Selects this delivery location"
                          accessibilityLabel={`${item.primaryText}, ${item.secondaryText ?? ''}${active ? ', selected' : ''}`}
                          accessibilityRole="button"
                          disabled={isResolving}
                          key={item.placeId ?? item.fullText}
                          onPress={() => handleSelectSuggestion(item)}
                          style={[styles.itemRow, active && styles.itemRowActive]}
                        >
                          <View style={styles.itemCopy}>
                            <Text numberOfLines={1} style={[styles.itemName, active && styles.itemNameActive]}>
                              {item.primaryText}
                            </Text>
                            {item.secondaryText ? (
                              <Text numberOfLines={1} style={styles.itemSub}>
                                {item.secondaryText}
                              </Text>
                            ) : null}
                          </View>

                          {isResolving ? (
                            <ActivityIndicator color={colors.goldStrong} size="small" />
                          ) : active ? (
                            <Ionicons color={colors.goldStrong} name="checkmark-circle" size={20} />
                          ) : null}
                        </PressableScale>
                      );
                    })
                  )}
                  {suggestions.length > 0 && (query.trim().length >= 2 || suggestions.some((s) => !s.isCurated)) ? (
                    <View
                      accessibilityLabel="Powered by Google"
                      style={styles.attributionContainer}
                    >
                      <Text style={styles.attributionText}>Powered by Google</Text>
                    </View>
                  ) : null}
                </ScrollView>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  attributionContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  attributionText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: 12,
    letterSpacing: 0.2,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.xs,
    height: 32,
    paddingHorizontal: spacing.sm,
  },
  backButtonText: {
    color: colors.ivory,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.xs,
  },
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
  confirmButton: {
    alignItems: 'center',
    backgroundColor: colors.goldStrong,
    borderRadius: radii.pill,
    height: 52,
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  confirmButtonText: {
    color: colors.black,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.sm,
  },
  confirmContainer: {
    gap: spacing.sm,
  },
  confirmHeaderCopy: {
    marginBottom: spacing.xs,
  },
  confirmedAddress: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.xs,
    marginTop: 2,
  },
  confirmedCard: {
    backgroundColor: colors.graphite,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  confirmedCopy: {
    flex: 1,
  },
  confirmedTitle: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.base,
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
    alignItems: 'center',
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
    minWidth: 0,
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
    paddingVertical: spacing.sm,
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
  noteInput: {
    backgroundColor: colors.graphite,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.ivory,
    fontFamily: typography.body,
    fontSize: fontSizes.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  noteLabel: {
    color: colors.silver,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.xs,
    marginBottom: spacing.xs,
  },
  noteSection: {
    marginTop: spacing.xs,
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
    letterSpacing: 0.2,
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