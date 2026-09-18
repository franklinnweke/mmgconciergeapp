import { describe, expect, it } from 'vitest';
import {
  calculateMapPadding,
  calculatePinCenterY,
  calculateSnapHeights,
  pickupSheetReducer,
  resolveInitialMode,
  resolveResetSource,
  shouldPropagateRegionChange,
} from './pickup-location-sheet-state';

describe('pickup-location-sheet-state', () => {
  const mockInsets = { top: 47, bottom: 34 };
  const mockScreenHeight = 844; // Standard iPhone 14/15 height

  describe('calculateSnapHeights', () => {
    it('calculates deterministic snap points maintaining proportion invariants', () => {
      const snaps = calculateSnapHeights(mockScreenHeight, mockInsets);

      // search_focused occupies ~62%
      expect(snaps.search_focused).toBe(Math.round(mockScreenHeight * 0.62)); // 523
      expect(snaps.search_focused).toBeLessThan(mockScreenHeight - mockInsets.top);

      // search_idle occupies ~36%
      expect(snaps.search_idle).toBe(Math.round(mockScreenHeight * 0.36)); // 304
      expect(snaps.search_idle).toBeLessThan(snaps.search_focused);

      // confirm occupies ~28%
      expect(snaps.confirm).toBe(Math.round(mockScreenHeight * 0.28)); // 236
      expect(snaps.confirm).toBeLessThan(snaps.search_idle);

      // All snap heights are positive numbers
      expect(snaps.confirm).toBeGreaterThanOrEqual(220);
      expect(snaps.search_idle).toBeGreaterThanOrEqual(250);
    });

    it('adapts safely to small screens (e.g. iPhone SE / 667px)', () => {
      const seHeight = 667;
      const seInsets = { top: 20, bottom: 0 };
      const snaps = calculateSnapHeights(seHeight, seInsets);

      expect(snaps.search_focused).toBeLessThan(seHeight - seInsets.top);
      expect(snaps.search_idle).toBeLessThan(snaps.search_focused);
      expect(snaps.confirm).toBeLessThan(snaps.search_idle);
      expect(snaps.confirm).toBeGreaterThanOrEqual(220);
    });

    it('adapts safely to large screens (e.g. Pro Max / 932px)', () => {
      const maxScreenHeight = 932;
      const snaps = calculateSnapHeights(maxScreenHeight, mockInsets);

      expect(snaps.search_focused).toBe(Math.round(maxScreenHeight * 0.62));
      expect(snaps.search_idle).toBe(Math.round(maxScreenHeight * 0.36));
      expect(snaps.confirm).toBe(Math.round(maxScreenHeight * 0.28));
    });
  });

  describe('calculateMapPadding', () => {
    it('provides correct top and bottom padding for each mode', () => {
      const snaps = calculateSnapHeights(mockScreenHeight, mockInsets);

      const idlePadding = calculateMapPadding('search_idle', snaps, mockInsets);
      expect(idlePadding.top).toBe(mockInsets.top + 60);
      expect(idlePadding.bottom).toBe(snaps.search_idle);
      expect(idlePadding.left).toBe(0);
      expect(idlePadding.right).toBe(0);

      const focusedPadding = calculateMapPadding('search_focused', snaps, mockInsets);
      expect(focusedPadding.bottom).toBe(snaps.search_focused);

      const confirmPadding = calculateMapPadding('confirm', snaps, mockInsets);
      expect(confirmPadding.bottom).toBe(snaps.confirm);
    });
  });

  describe('calculatePinCenterY', () => {
    it('locates the geometric center of the unobscured map viewport', () => {
      const mapPadding = { top: 100, bottom: 400 };
      const screenHeight = 800;

      // Visible map area: 800 - 100 - 400 = 300px
      // Center: 100 + 300 / 2 = 250px from screen top
      const centerY = calculatePinCenterY(screenHeight, mapPadding);
      expect(centerY).toBe(250);
    });

    it('shifts center downward when bottom sheet lowers in confirm mode', () => {
      const snaps = calculateSnapHeights(mockScreenHeight, mockInsets);
      const idlePadding = calculateMapPadding('search_idle', snaps, mockInsets);
      const confirmPadding = calculateMapPadding('confirm', snaps, mockInsets);

      const idleCenter = calculatePinCenterY(mockScreenHeight, idlePadding);
      const confirmCenter = calculatePinCenterY(mockScreenHeight, confirmPadding);

      // In confirm mode the sheet is shorter, so the visible map area is larger,
      // and the center of the visible area is lower on screen
      expect(confirmCenter).toBeGreaterThan(idleCenter);
    });
  });

  describe('resolveInitialMode', () => {
    it('opens directly in confirm mode when an existing location is present', () => {
      expect(resolveInitialMode(true)).toBe('confirm');
    });

    it('opens in search_idle mode when no existing location is selected', () => {
      expect(resolveInitialMode(false)).toBe('search_idle');
    });
  });

  describe('pickupSheetReducer', () => {
    it('transitions correctly between states on user actions', () => {
      // Start in search_idle
      let mode = resolveInitialMode(false);
      expect(mode).toBe('search_idle');

      // Focus search -> expands
      mode = pickupSheetReducer(mode, { type: 'FOCUS_SEARCH' });
      expect(mode).toBe('search_focused');

      // Blur search -> returns to search_idle
      mode = pickupSheetReducer(mode, { type: 'BLUR_SEARCH' });
      expect(mode).toBe('search_idle');

      // Focus search again
      mode = pickupSheetReducer(mode, { type: 'FOCUS_SEARCH' });
      expect(mode).toBe('search_focused');

      // Select place -> transitions to confirm
      mode = pickupSheetReducer(mode, { type: 'SELECT_LOCATION' });
      expect(mode).toBe('confirm');

      // Blur in confirm mode does not leave confirm
      mode = pickupSheetReducer(mode, { type: 'BLUR_SEARCH' });
      expect(mode).toBe('confirm');

      // Tap Change -> returns to search_idle
      mode = pickupSheetReducer(mode, { type: 'CHANGE_LOCATION' });
      expect(mode).toBe('search_idle');
    });
  });

  describe('shouldPropagateRegionChange', () => {
    it('blocks programmatic camera animations without user gestures', () => {
      // Recenter or reset animation running programmatically
      expect(
        shouldPropagateRegionChange({
          disabled: false,
          isProgrammatic: true,
          isUserGesture: false,
        }),
      ).toBe(false);
    });

    it('blocks all region changes when disabled (e.g. in search modes)', () => {
      expect(
        shouldPropagateRegionChange({
          disabled: true,
          isProgrammatic: false,
          isUserGesture: true,
        }),
      ).toBe(false);

      expect(
        shouldPropagateRegionChange({
          disabled: true,
          isProgrammatic: true,
          isUserGesture: false,
        }),
      ).toBe(false);
    });

    it('blocks arbitrary non-gesture region changes', () => {
      expect(
        shouldPropagateRegionChange({
          disabled: false,
          isProgrammatic: false,
          isUserGesture: false,
        }),
      ).toBe(false);
    });

    it('allows genuine user pan adjustments in enabled mode', () => {
      expect(
        shouldPropagateRegionChange({
          disabled: false,
          isProgrammatic: false,
          isUserGesture: true,
        }),
      ).toBe(true);
    });

    it('prioritizes user interaction over programmatic move if user grabs the map', () => {
      expect(
        shouldPropagateRegionChange({
          disabled: false,
          isProgrammatic: true,
          isUserGesture: true,
        }),
      ).toBe(true);
    });
  });

  describe('resolveResetSource', () => {
    it('restores the exact original source when defined', () => {
      expect(resolveResetSource('suggested')).toBe('suggested');
      expect(resolveResetSource('place_search')).toBe('place_search');
      expect(resolveResetSource('current_location')).toBe('current_location');
    });

    it('defaults to suggested if original source was undefined', () => {
      expect(resolveResetSource(undefined)).toBe('suggested');
    });
  });
});
