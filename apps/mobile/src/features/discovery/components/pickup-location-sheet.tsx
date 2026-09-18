import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, radii, spacing, typography } from '@mmg/brand';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { calculateDistanceMeters } from '../domain/arrival-perimeter';
import { type PickupLocation, deriveLagosAreaLabel } from '../domain/pickup-location';
import {
  calculateMapPadding,
  calculatePinCenterY,
  calculateSnapHeights,
  type PickupSheetMode,
  resolveInitialMode,
  resolveResetSource,
} from '../domain/pickup-location-sheet-state';
import { useCurrentLocation } from '../hooks/use-current-location';
import { usePlaceSearch, type PlaceSuggestion } from '../hooks/use-place-search';
import { PickupPinMap } from './pickup-pin-map';

export type PickupLocationSheetProps = {
  visible: boolean;
  selectedLocation?: PickupLocation | null;
  onSelectLocation(location: PickupLocation): void;
  onClose(): void;
};

const DEFAULT_LAGOS_COORDS = {
  latitude: 6.4269,
  longitude: 3.4285,
};

export function PickupLocationSheet({
  visible,
  selectedLocation,
  onSelectLocation,
  onClose,
}: PickupLocationSheetProps) {
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  const [mode, setMode] = useState<PickupSheetMode>(() =>
    resolveInitialMode(Boolean(selectedLocation)),
  );
  const [query, setQuery] = useState('');
  const [pendingLocation, setPendingLocation] = useState<PickupLocation | null>(() => selectedLocation ?? null);
  const [initialCoords, setInitialCoords] = useState<{ latitude: number; longitude: number } | null>(() =>
    selectedLocation ? { latitude: selectedLocation.latitude, longitude: selectedLocation.longitude } : null,
  );
  const [initialSource, setInitialSource] = useState<PickupLocation['source']>(() => selectedLocation?.source ?? 'suggested');
  const [note, setNote] = useState(() => selectedLocation?.note ?? '');
  const [resolvingPlaceId, setResolvingPlaceId] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const searchInputRef = useRef<TextInput>(null);

  const { suggestions, isLoading: searching, error: searchError, resolvePlace } = usePlaceSearch(query);
  const {
    requestCurrentLocation,
    status: currentLocStatus,
    errorMessage: currentLocError,
    reset: resetCurrentLoc,
  } = useCurrentLocation();

  const snapHeights = useMemo(
    () => calculateSnapHeights(screenHeight, insets),
    [screenHeight, insets],
  );

  const mapPadding = useMemo(
    () => calculateMapPadding(mode, snapHeights, insets),
    [mode, snapHeights, insets],
  );

  const pinCenterY = useMemo(
    () => calculatePinCenterY(screenHeight, mapPadding),
    [screenHeight, mapPadding],
  );

  // Adjust state during render when visible or selectedLocation changes (React 19 pattern)
  const [prevVisible, setPrevVisible] = useState(visible);
  const [prevSelectedLocation, setPrevSelectedLocation] = useState(selectedLocation);

  if (visible !== prevVisible || selectedLocation !== prevSelectedLocation) {
    setPrevVisible(visible);
    setPrevSelectedLocation(selectedLocation);
    if (visible) {
      if (selectedLocation) {
        setPendingLocation(selectedLocation);
        setInitialCoords({ latitude: selectedLocation.latitude, longitude: selectedLocation.longitude });
        setInitialSource(selectedLocation.source);
        setNote(selectedLocation.note ?? '');
        setMode('confirm');
      } else {
        setPendingLocation(null);
        setInitialCoords(null);
        setInitialSource('suggested');
        setNote('');
        setMode('search_idle');
      }
      setQuery('');
      setResolveError(null);
    }
  }

  // Animate the panel's real layout height so invisible bounds never cover the map.
  const panelHeight = useSharedValue(snapHeights[mode]);

  useEffect(() => {
    const target = snapHeights[mode];
    if (reducedMotion) {
      panelHeight.value = withTiming(target, { duration: 150 });
    } else {
      panelHeight.value = withSpring(target, {
        damping: 26,
        stiffness: 260,
        mass: 0.85,
      });
    }
  }, [mode, snapHeights, reducedMotion, panelHeight]);

  const animatedPanelStyle = useAnimatedStyle(() => ({
    height: panelHeight.value,
  }));

  const handleDismiss = useCallback(() => {
    setQuery('');
    setPendingLocation(null);
    setInitialCoords(null);
    setInitialSource('suggested');
    setNote('');
    setResolveError(null);
    resetCurrentLoc();
    onClose();
  }, [onClose, resetCurrentLoc]);

  const handleConfirm = () => {
    if (!pendingLocation) return;
    onSelectLocation({
      ...pendingLocation,
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    handleDismiss();
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

  const handleSelectSuggestion = async (item: PlaceSuggestion) => {
    setResolveError(null);
    Keyboard.dismiss();

    if (item.isCurated && item.location) {
      setPendingLocation(item.location);
      setInitialCoords({ latitude: item.location.latitude, longitude: item.location.longitude });
      setInitialSource('suggested');
      setNote(item.location.note ?? (isSelected(item.location) ? (selectedLocation?.note ?? '') : ''));
      setMode('confirm');
      return;
    }

    setResolvingPlaceId(item.placeId);
    try {
      const location = await resolvePlace(item);
      setPendingLocation(location);
      setInitialCoords({ latitude: location.latitude, longitude: location.longitude });
      setInitialSource('place_search');
      setNote(isSelected(location) ? (selectedLocation?.note ?? '') : '');
      setMode('confirm');
    } catch (error) {
      setResolveError(error instanceof Error ? error.message : 'Could not resolve pickup location.');
    } finally {
      setResolvingPlaceId(null);
    }
  };

  const handleCurrentLocationPress = async () => {
    setResolveError(null);
    Keyboard.dismiss();
    const result = await requestCurrentLocation();
    if (!result.success) return;
    setPendingLocation(result.location);
    setInitialCoords({ latitude: result.location.latitude, longitude: result.location.longitude });
    setInitialSource('current_location');
    setNote(selectedLocation?.note ?? '');
    setMode('confirm');
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
      source: resolveResetSource(initialSource),
      serviceAreaLabel: newArea ?? pendingLocation.serviceAreaLabel,
    });
  };

  const hasAdjustedPin = useMemo(() => {
    if (!pendingLocation || !initialCoords) return false;
    const dist = calculateDistanceMeters(
      initialCoords.latitude,
      initialCoords.longitude,
      pendingLocation.latitude,
      pendingLocation.longitude,
    );
    return dist > 5;
  }, [pendingLocation, initialCoords]);

  const bannerMessage = currentLocError || searchError || resolveError;
  const serviceAreaNotice = currentLocStatus === 'outside_lagos' && Boolean(currentLocError);

  const effectiveLat = pendingLocation?.latitude ?? initialCoords?.latitude ?? selectedLocation?.latitude ?? DEFAULT_LAGOS_COORDS.latitude;
  const effectiveLng = pendingLocation?.longitude ?? initialCoords?.longitude ?? selectedLocation?.longitude ?? DEFAULT_LAGOS_COORDS.longitude;

  if (!visible) return null;

  return (
    <Modal
      accessibilityViewIsModal
      animationType="fade"
      hardwareAccelerated
      onRequestClose={handleDismiss}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.root}>
        {/* Full-surface interactive background map */}
        <PickupPinMap
          disabled={mode !== 'confirm' || !pendingLocation}
          initialLatitude={initialCoords?.latitude}
          initialLongitude={initialCoords?.longitude}
          latitude={effectiveLat}
          longitude={effectiveLng}
          mapPadding={mapPadding}
          onCoordinatesChange={handlePinCoordinateChange}
          onReset={handleResetPin}
          pinCenterY={pinCenterY}
          showsInstruction={false}
          showsPin={Boolean(pendingLocation) && mode !== 'search_focused'}
          showsUserLocation={currentLocStatus === 'success'}
          style={StyleSheet.absoluteFill}
        />

        {/* Floating Top Controls */}
        <View
          pointerEvents="box-none"
          style={[styles.floatingControls, { top: Math.max(insets.top, 16) + 8 }]}
        >
          <Pressable
            accessibilityLabel="Close location selection"
            accessibilityRole="button"
            onPress={handleDismiss}
            style={styles.floatingCloseButton}
          >
            <Ionicons color={colors.ivory} name="close" size={20} />
          </Pressable>

          {mode === 'confirm' && hasAdjustedPin ? (
            <PressableScale
              accessibilityLabel="Reset pickup point"
              accessibilityRole="button"
              onPress={handleResetPin}
              style={styles.floatingResetButton}
            >
              <Ionicons color={colors.goldStrong} name="refresh-outline" size={15} />
              <Text style={styles.floatingResetText}>Reset pin</Text>
            </PressableScale>
          ) : null}
        </View>

        {/* Overlaid Draggable Bottom Panel */}
        <Animated.View
          style={[
            styles.panel,
            { paddingBottom: Math.max(insets.bottom, spacing.md) },
            animatedPanelStyle,
          ]}
        >
          <View accessibilityElementsHidden style={styles.dragHandleZone}>
            <View style={styles.dragHandle} />
          </View>

          {mode === 'confirm' && pendingLocation ? (
            /* Confirm Pickup Mode */
            <ScrollView
              bounces={false}
              contentContainerStyle={styles.confirmContentContainer}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.panelScroll}
            >
              <View style={styles.header}>
                <View style={styles.headerTitleGroup}>
                  <Text accessibilityRole="header" style={styles.title}>
                    Confirm pickup location
                  </Text>
                  <Text style={styles.subtitle}>
                    Pan the map above to pinpoint the exact arrival gate.
                  </Text>
                </View>
                <PressableScale
                  accessibilityLabel="Back to pickup search"
                  accessibilityRole="button"
                  onPress={() => {
                    Keyboard.dismiss();
                    setQuery('');
                    setResolveError(null);
                    setMode('search_idle');
                  }}
                  style={styles.changeButton}
                >
                  <Text style={styles.changeButtonText}>Change</Text>
                </PressableScale>
              </View>

              <View style={styles.confirmedCard}>
                <View style={styles.confirmedBadgeRow}>
                  <Text numberOfLines={1} style={styles.confirmedTitle}>
                    {pendingLocation.displayName}
                  </Text>
                  {pendingLocation.serviceAreaLabel ? (
                    <View style={styles.areaTag}>
                      <Text style={styles.areaTagText}>{pendingLocation.serviceAreaLabel}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.confirmedAddress}>{pendingLocation.formattedAddress}</Text>
              </View>

              <Text style={styles.mapHint}>
                Drag the map to fine-tune the exact arrival point.
              </Text>

              <PressableScale
                accessibilityLabel="Confirm pickup location"
                accessibilityRole="button"
                onPress={handleConfirm}
                style={styles.confirmButton}
              >
                <Text style={styles.confirmButtonText}>Confirm pickup location</Text>
              </PressableScale>

              {initialSource === 'place_search' ? (
                <View accessibilityLabel="Powered by Google" style={styles.attributionContainer}>
                  <Text style={styles.attributionText}>Powered by Google</Text>
                </View>
              ) : null}
            </ScrollView>
          ) : (
            /* Search Mode (Idle & Focused) */
            <View style={styles.searchBody}>
              <View style={styles.header}>
                <View style={styles.headerTitleGroup}>
                  <Text accessibilityRole="header" style={styles.title}>
                    Where should we bring the car?
                  </Text>
                </View>
              </View>

              {bannerMessage ? (
                <View style={serviceAreaNotice ? styles.serviceAreaNotice : styles.errorBox}>
                  <Ionicons
                    color={serviceAreaNotice ? colors.goldStrong : colors.danger}
                    name={serviceAreaNotice ? 'information-circle-outline' : 'alert-circle-outline'}
                    size={17}
                  />
                  <Text style={serviceAreaNotice ? styles.serviceAreaNoticeText : styles.errorText}>
                    {bannerMessage}
                  </Text>
                </View>
              ) : null}

              {/* Current location quick action (shown in idle or when query empty) */}
              {mode === 'search_idle' ? (
                <PressableScale
                  accessibilityLabel="Use my current location"
                  accessibilityRole="button"
                  disabled={currentLocStatus === 'requesting'}
                  onPress={handleCurrentLocationPress}
                  style={styles.currentLocationAction}
                >
                  <View pointerEvents="none" style={styles.currentLocationRow}>
                    <View style={styles.currentLocationIcon}>
                      {currentLocStatus === 'requesting' ? (
                        <ActivityIndicator color={colors.goldStrong} size="small" />
                      ) : (
                        <Ionicons color={colors.goldStrong} name="navigate-outline" size={20} />
                      )}
                    </View>
                    <Text numberOfLines={1} style={styles.currentLocationTitle}>
                      {currentLocStatus === 'requesting' ? 'Finding your location…' : 'Use my current location'}
                    </Text>
                    <Ionicons color={colors.muted} name="chevron-forward" size={16} />
                  </View>
                </PressableScale>
              ) : null}

              {/* Search input field */}
              <View style={styles.searchContainer}>
                <Ionicons
                  color={colors.muted}
                  name="search-outline"
                  size={18}
                  style={styles.searchIcon}
                />
                <TextInput
                  accessibilityLabel="Search Lagos address or landmark"
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                  onBlur={() => {
                    if (!query.trim()) {
                      setMode('search_idle');
                    }
                  }}
                  onChangeText={setQuery}
                  onFocus={() => setMode('search_focused')}
                  placeholder="Search Lagos address or landmark..."
                  placeholderTextColor={colors.muted}
                  ref={searchInputRef}
                  style={styles.searchInput}
                  value={query}
                />
                {searching ? (
                  <ActivityIndicator
                    color={colors.goldStrong}
                    size="small"
                    style={styles.searchBusy}
                  />
                ) : query ? (
                  <Pressable
                    accessibilityLabel="Clear search"
                    onPress={() => setQuery('')}
                    style={styles.clearSearch}
                  >
                    <Ionicons color={colors.muted} name="close-circle" size={16} />
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeaderTitle}>
                  {mode === 'search_focused' ? (query.trim().length > 0 ? 'Matching locations' : 'Search results') : 'Quick picks'}
                </Text>
              </View>

              {/* Suggestions / Landmarks list */}
              <ScrollView
                automaticallyAdjustKeyboardInsets
                contentContainerStyle={styles.list}
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                style={styles.panelScroll}
              >
                {suggestions.length === 0 ? (
                  <View style={styles.emptyResultsBox}>
                    <Text style={styles.emptyResultsText}>
                      No Lagos landmarks match this search.
                    </Text>
                  </View>
                ) : (
                  (mode === 'search_focused' ? suggestions : suggestions.filter((item) => item.isCurated).slice(0, 2)).map((item) => {
                    const active = isSelected(item);
                    const isResolving = resolvingPlaceId === item.placeId;
                    return (
                      <PressableScale
                        accessibilityHint="Selects this pickup location"
                        accessibilityLabel={`${item.primaryText}, ${item.secondaryText ?? ''}${active ? ', selected' : ''}`}
                        accessibilityRole="button"
                        disabled={isResolving}
                        key={item.placeId ?? item.fullText}
                        onPress={() => handleSelectSuggestion(item)}
                        style={[styles.itemRow, active && styles.itemRowActive]}
                      >
                        <View style={styles.itemCopy}>
                          <Text
                            numberOfLines={2}
                            style={[styles.itemName, active && styles.itemNameActive]}
                          >
                            {item.primaryText}
                          </Text>
                          {item.secondaryText ? (
                            <Text numberOfLines={2} style={styles.itemSub}>
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
                {suggestions.length > 0 &&
                (query.trim().length >= 2 || suggestions.some((item) => !item.isCurated)) ? (
                  <View accessibilityLabel="Powered by Google" style={styles.attributionContainer}>
                    <Text style={styles.attributionText}>Powered by Google</Text>
                  </View>
                ) : null}
              </ScrollView>
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  areaTag: {
    backgroundColor: 'rgba(212, 175, 55, 0.12)',
    borderColor: 'rgba(212, 175, 55, 0.3)',
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  areaTagText: {
    color: colors.goldStrong,
    fontFamily: typography.bodyMedium,
    fontSize: 10,
    letterSpacing: 0.3,
  },
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
  changeButton: {
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: spacing.xs,
  },
  changeButtonText: {
    color: colors.goldStrong,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.xs,
  },
  clearSearch: {
    flexShrink: 0,
    padding: spacing.xs,
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
  confirmContentContainer: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  confirmedAddress: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.xs,
    lineHeight: 18,
    marginTop: 4,
  },
  confirmedBadgeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  confirmedCard: {
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing.md,
    paddingTop: spacing.xs,
  },
  confirmedTitle: {
    color: colors.ivory,
    flex: 1,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.base,
    minWidth: 0,
  },
  currentLocationCopy: {
    flex: 1,
    minWidth: 0,
  },
  currentLocationIcon: {
    alignItems: 'center',
    flexShrink: 0,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  currentLocationAction: {
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.xs,
    width: '100%',
  },
  currentLocationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    width: '100%',
  },
  currentLocationTitle: {
    color: colors.ivory,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.sm,
  },
  dragHandle: {
    alignSelf: 'center',
    backgroundColor: colors.lineStrong,
    borderRadius: radii.pill,
    height: 4,
    width: 36,
  },
  dragHandleZone: {
    paddingBottom: spacing.sm,
    paddingTop: spacing.xs,
    width: '100%',
  },
  emptyResultsBox: {
    paddingVertical: spacing.xl,
  },
  emptyResultsText: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.xs,
    textAlign: 'center',
  },
  errorBox: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderColor: colors.danger,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  errorText: {
    color: colors.danger,
    flex: 1,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.xs,
    lineHeight: 18,
    minWidth: 0,
  },
  floatingCloseButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 20, 20, 0.85)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  floatingControls: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: spacing.lg,
    position: 'absolute',
    right: spacing.lg,
    zIndex: 10,
  },
  floatingResetButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 20, 20, 0.85)',
    borderColor: colors.goldStrong,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    height: 38,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  floatingResetText: {
    color: colors.goldStrong,
    fontFamily: typography.bodySemiBold,
    fontSize: fontSizes.xs,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  headerTitleGroup: {
    flex: 1,
    minWidth: 0,
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
    lineHeight: 19,
  },
  itemNameActive: {
    color: colors.goldStrong,
  },
  itemRow: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  itemRowActive: {
    borderBottomColor: colors.goldStrong,
  },
  itemSub: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.xs,
    lineHeight: 17,
    marginTop: 2,
  },
  list: {
    paddingBottom: spacing.sm,
  },
  mapHint: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.xs,
    lineHeight: 17,
    marginTop: spacing.xs,
  },
  panelScroll: {
    flex: 1,
  },
  panel: {
    backgroundColor: colors.canvas,
    borderTopColor: colors.lineStrong,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderTopWidth: 1,
    bottom: 0,
    elevation: 20,
    left: 0,
    paddingHorizontal: spacing.lg,
    position: 'absolute',
    right: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  root: {
    ...StyleSheet.absoluteFill,
  },
  searchBody: {
    flex: 1,
  },
  searchBusy: {
    flexShrink: 0,
    marginLeft: spacing.xs,
  },
  searchContainer: {
    alignItems: 'center',
    backgroundColor: colors.graphite,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  searchIcon: {
    flexShrink: 0,
    marginRight: spacing.sm,
  },
  searchInput: {
    color: colors.ivory,
    flex: 1,
    fontFamily: typography.body,
    fontSize: fontSizes.sm,
    height: 44,
    minWidth: 0,
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
  serviceAreaNotice: {
    alignItems: 'flex-start',
    backgroundColor: colors.graphite,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  serviceAreaNoticeText: {
    color: colors.silver,
    flex: 1,
    fontFamily: typography.bodyMedium,
    fontSize: fontSizes.xs,
    lineHeight: 18,
    minWidth: 0,
  },
  subtitle: {
    color: colors.muted,
    fontFamily: typography.body,
    fontSize: fontSizes.xs,
    lineHeight: 18,
    marginTop: 2,
  },
  title: {
    color: colors.ivory,
    fontFamily: typography.display,
    fontSize: fontSizes.lg,
    letterSpacing: -0.3,
  },
});
