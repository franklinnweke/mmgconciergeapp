import { Ionicons } from '@expo/vector-icons';
import { typography } from '@mmg/brand';
import { Tabs } from 'expo-router';

import { useTheme } from '../../core/theme';
import { SessionRouteGuard } from '../../features/auth/components/session-route-guard';

const iconNames = {
  account: ['person-outline', 'person'] as const,
  browse: ['search-outline', 'search'] as const,
  index: ['home-outline', 'home'] as const,
  trips: ['calendar-clear-outline', 'calendar-clear'] as const,
};

export default function RenterTabsLayout() {
  const { colors, isDark } = useTheme();

  return (
    <SessionRouteGuard expected="renter">
      <Tabs
        screenOptions={({ route }) => ({
          headerShown: false,
          sceneStyle: { backgroundColor: colors.canvas, overflow: 'hidden' },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarHideOnKeyboard: true,
          tabBarIcon: ({ color, focused, size }) => {
            const names = iconNames[route.name as keyof typeof iconNames] ?? iconNames.index;
            return <Ionicons color={color} name={focused ? names[1] : names[0]} size={size} />;
          },
          tabBarItemStyle: { paddingTop: 8 },
          tabBarLabelStyle: {
            fontFamily: typography.bodyMedium,
            fontSize: 11,
            letterSpacing: 0.2,
            marginTop: 2,
          },
          tabBarStyle: {
            backgroundColor: isDark ? 'rgba(10, 10, 10, 0.98)' : colors.surface,
            borderTopColor: colors.border,
            height: 82,
            paddingBottom: 12,
          },
        })}
      >
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarButtonTestID: 'tab-home' }} />
        <Tabs.Screen name="browse" options={{ title: 'Discover', tabBarButtonTestID: 'tab-discover' }} />
        <Tabs.Screen name="trips" options={{ title: 'Trips', tabBarButtonTestID: 'tab-trips' }} />
        <Tabs.Screen name="account" options={{ title: 'Account', tabBarButtonTestID: 'tab-account' }} />
      </Tabs>
    </SessionRouteGuard>
  );
}
