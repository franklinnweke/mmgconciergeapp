import type { PickupLocationSource } from './pickup-location';

export type PickupSheetMode = 'search_idle' | 'search_focused' | 'confirm';

export type Insets = {
  top: number;
  bottom: number;
  left?: number;
  right?: number;
};

export type SnapHeights = {
  search_idle: number;
  search_focused: number;
  confirm: number;
};

export type MapPadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type SheetTransitionEvent =
  | { type: 'FOCUS_SEARCH' }
  | { type: 'BLUR_SEARCH' }
  | { type: 'SELECT_LOCATION' }
  | { type: 'CHANGE_LOCATION' };

/**
 * Calculates deterministic snap heights for the 3 sheet modes.
 * - search_idle: ~36% viewport height (map-first default with only essential controls)
 * - search_focused: ~62% viewport height (temporary expansion for keyboard + results)
 * - confirm: ~28% viewport height (map-dominant exact pickup confirmation)
 */
export function calculateSnapHeights(screenHeight: number, insets: Insets): SnapHeights {
  const safeTop = insets.top || 0;

  // Search may expand, but the map should always remain a meaningful visual surface.
  const maxFocusedHeight = Math.max(360, screenHeight - safeTop - 120);
  const searchFocused = Math.min(
    maxFocusedHeight,
    Math.max(400, Math.round(screenHeight * 0.62)),
  );

  // Default pickup surface is map-first: controls occupy roughly the lower third.
  const searchIdle = Math.min(
    searchFocused - 120,
    Math.max(250, Math.round(screenHeight * 0.36)),
  );

  // Once a location is selected, expose even more map for precise pin placement.
  const confirm = Math.min(
    searchIdle,
    Math.max(220, Math.round(screenHeight * 0.28)),
  );

  return {
    search_idle: searchIdle,
    search_focused: searchFocused,
    confirm,
  };
}

/**
 * Calculates the mapPadding to keep map center aligned in the visible viewport.
 */
export function calculateMapPadding(
  mode: PickupSheetMode,
  snapHeights: SnapHeights,
  insets: Insets,
): MapPadding {
  const topPadding = Math.round((insets.top || 0) + 60);
  const bottomPadding = snapHeights[mode];

  return {
    top: topPadding,
    right: 0,
    bottom: bottomPadding,
    left: 0,
  };
}

/**
 * Calculates the vertical center anchor for the fixed pin relative to the screen.
 * Places the pin at the geometric center of the unobscured map area.
 */
export function calculatePinCenterY(
  screenHeight: number,
  mapPadding: { top: number; bottom: number },
): number {
  const visibleMapHeight = Math.max(0, screenHeight - mapPadding.top - mapPadding.bottom);
  return Math.round(mapPadding.top + visibleMapHeight / 2);
}

/**
 * Resolves initial mode based on whether a pickup location is already selected.
 */
export function resolveInitialMode(hasExistingLocation: boolean): PickupSheetMode {
  return hasExistingLocation ? 'confirm' : 'search_idle';
}

/**
 * Pure transition reducer for the pickup sheet state.
 */
export function pickupSheetReducer(
  currentMode: PickupSheetMode,
  event: SheetTransitionEvent,
): PickupSheetMode {
  switch (event.type) {
    case 'FOCUS_SEARCH':
      return 'search_focused';
    case 'BLUR_SEARCH':
      return currentMode === 'search_focused' ? 'search_idle' : currentMode;
    case 'SELECT_LOCATION':
      return 'confirm';
    case 'CHANGE_LOCATION':
      return 'search_idle';
    default:
      return currentMode;
  }
}

/**
 * Determines whether a completed region change should be propagated as a user pin adjustment.
 * Prevents programmatic camera animations (recenter, reset, clamp) from masquerading as user edits.
 */
export function shouldPropagateRegionChange(params: {
  disabled?: boolean;
  isProgrammatic: boolean;
  isUserGesture: boolean;
}): boolean {
  if (params.disabled) return false;
  if (params.isProgrammatic && !params.isUserGesture) return false;
  return params.isUserGesture;
}

/**
 * Resolves original source when resetting an adjusted pin.
 * Preserves 'suggested', 'place_search', or 'current_location'.
 */
export function resolveResetSource(originalSource?: PickupLocationSource): PickupLocationSource {
  return originalSource ?? 'suggested';
}
