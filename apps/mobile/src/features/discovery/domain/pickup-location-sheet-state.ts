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
 * - search_idle: ~52% viewport height (half screen map, half screen search/landmarks)
 * - search_focused: ~85% viewport height (expanded for keyboard + long results)
 * - confirm: ~44% viewport height (~56% map for fine-tuning arrival gate)
 */
export function calculateSnapHeights(screenHeight: number, insets: Insets): SnapHeights {
  const safeTop = insets.top || 0;

  // Maximum expansion: leave at least insets.top + 50px of map visible behind search
  const maxFocusedHeight = Math.max(280, screenHeight - safeTop - 50);
  const searchFocused = Math.min(maxFocusedHeight, Math.round(screenHeight * 0.85));

  // Search idle: around 52% of the screen, ensuring at least 320px
  const searchIdle = Math.min(
    searchFocused - 40,
    Math.max(320, Math.round(screenHeight * 0.52)),
  );

  // Confirm: around 44% of the screen, ensuring at least 260px and room for CTA + note
  const confirm = Math.min(
    searchIdle - 20,
    Math.max(260, Math.round(screenHeight * 0.44)),
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
