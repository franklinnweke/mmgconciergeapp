import { darkThemeColors, lightThemeColors } from '@mmg/brand';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '../../../core/theme';
import { RenterProfileScreen } from './renter-profile-screen';

const mocks = vi.hoisted(() => {
  let scheme: 'light' | 'dark' | null = 'dark';
  return {
    auth: {
      refreshUser: vi.fn(async () => {}),
      signOut: vi.fn(async () => {}),
      signingOut: false,
      user: {
        displayName: 'Amara Nwosu',
        email: 'amara@example.com',
        photoURL: null,
        uid: 'user-123',
      },
    },
    getScheme: () => scheme,
    renterProfile: {
      errorMessage: null as string | null,
      isLoading: false,
      isSaving: false,
      profile: {
        acceptedPrivacyNoticeVersion: '2026-03-01',
        acceptedRenterTermsVersion: '2026-03-01',
        accountStatus: 'active' as const,
        createdAt: '2026-03-01T10:00:00.000Z',
        defaultDeliveryAddress: null,
        email: 'amara@example.com',
        fullName: 'Amara Nwosu',
        phone: '+2348012345678',
        profileVersion: 1,
        renterId: 'user-123',
        updatedAt: '2026-03-01T10:00:00.000Z',
      },
      refresh: vi.fn(async () => {}),
      requestDeletion: vi.fn(async () => {}),
      saveProfile: vi.fn(async () => {}),
    },
    setScheme: (val: 'light' | 'dark' | null) => {
      scheme = val;
    },
  };
});

vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Alert: { alert: vi.fn() },
  Modal: 'Modal',
  Platform: { OS: 'ios' },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 },
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
  useColorScheme: () => mocks.getScheme(),
  useWindowDimensions: () => ({ height: 844, width: 390 }),
}));

vi.mock('expo-haptics', () => ({
  selectionAsync: vi.fn(async () => undefined),
}));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0, top: 47 }),
}));

vi.mock('expo-image', () => ({ Image: 'Image' }));
vi.mock('../../../components/brand-logo', () => ({ BrandLogo: 'BrandLogo' }));
vi.mock('../../../components/brand-wordmark', () => ({ BrandWordmark: 'BrandWordmark' }));
vi.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(),
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

vi.mock('../../../core/auth/auth-context', () => ({
  useAuth: () => mocks.auth,
}));

vi.mock('../hooks/use-renter-profile', () => ({
  useRenterProfile: () => mocks.renterProfile,
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => {}),
  },
}));

vi.mock('../data/renter-profile-photo', () => ({
  uploadRenterProfilePhoto: vi.fn(),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('RenterProfileScreen theme integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setScheme('dark');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders with dark theme by default with dark keyboard and dark button styles', async () => {
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <ThemeProvider>
          <RenterProfileScreen />
        </ThemeProvider>,
      );
    });

    const root = renderer!.root;
    // SafeAreaView root has canvas background
    const safeArea = root.findByType('SafeAreaView' as any);
    expect(safeArea.props.style.backgroundColor).toBe(darkThemeColors.canvas);

    // TextInputs have dark keyboardAppearance and dark theme placeholder text
    const textInputs = root.findAllByType('TextInput' as any);
    expect(textInputs.length).toBeGreaterThanOrEqual(2);
    for (const input of textInputs) {
      expect(input.props.keyboardAppearance).toBe('dark');
      expect(input.props.placeholderTextColor).toBe(darkThemeColors.textMuted);
      expect(input.props.style.color).toBe(darkThemeColors.textPrimary);
    }

    // Modal backdrop uses dark scrim
    const modal = root.findByType('Modal' as any);
    expect(modal).toBeDefined();
    expect(modal.props.children.props.style.backgroundColor).toBe(darkThemeColors.scrim);
  });

  it('renders with light theme when initialMode is "light" with light keyboard and high contrast', async () => {
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <ThemeProvider initialMode="light">
          <RenterProfileScreen />
        </ThemeProvider>,
      );
    });

    const root = renderer!.root;
    // SafeAreaView root has light canvas background
    const safeArea = root.findByType('SafeAreaView' as any);
    expect(safeArea.props.style.backgroundColor).toBe(lightThemeColors.canvas);

    // TextInputs have light keyboardAppearance and light theme placeholder text
    const textInputs = root.findAllByType('TextInput' as any);
    expect(textInputs.length).toBeGreaterThanOrEqual(2);
    for (const input of textInputs) {
      expect(input.props.keyboardAppearance).toBe('light');
      expect(input.props.placeholderTextColor).toBe(lightThemeColors.textMuted);
      expect(input.props.style.color).toBe(lightThemeColors.textPrimary);
    }

    // Modal backdrop uses light scrim
    const modal = root.findByType('Modal' as any);
    expect(modal).toBeDefined();
    expect(modal.props.children.props.style.backgroundColor).toBe(lightThemeColors.scrim);
  });
});
