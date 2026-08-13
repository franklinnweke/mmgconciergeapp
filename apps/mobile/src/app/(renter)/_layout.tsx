import { Ionicons } from '@expo/vector-icons';
import { colors, typography } from '@mmg/brand';
import { Redirect, Tabs } from 'expo-router';

import { useAuth } from '@/core/auth/auth-context';

const iconNames = {
  account: ['person-outline', 'person'] as const,
  browse: ['search-outline', 'search'] as const,
  index: ['home-outline', 'home'] as const,
  trips: ['calendar-clear-outline', 'calendar-clear'] as const,
};

export default function RenterTabsLayout() {
  const { initializing, user } = useAuth();

  if (!initializing && (!user || !user.emailVerified)) {
    return <Redirect href="/" />;
  }

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneStyle: { backgroundColor: colors.black },
        tabBarActiveTintColor: colors.goldStrong,
        tabBarInactiveTintColor: colors.muted,
        tabBarHideOnKeyboard: true,
        tabBarIcon: ({ color, focused, size }) => {
          const names = iconNames[route.name as keyof typeof iconNames] ?? iconNames.index;
          return <Ionicons color={color} name={focused ? names[1] : names[0]} size={size} />;
        },
        tabBarItemStyle: { paddingTop: 8 },
        tabBarLabelStyle: {
          fontFamily: typography.bodyMedium,
          fontSize: 10,
          letterSpacing: 0.3,
          marginTop: 2,
        },
        tabBarStyle: {
          backgroundColor: 'rgba(10, 10, 10, 0.98)',
          borderTopColor: colors.line,
          height: 82,
          paddingBottom: 12,
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="browse" options={{ title: 'Discover' }} />
      <Tabs.Screen name="trips" options={{ title: 'Trips' }} />
      <Tabs.Screen name="account" options={{ title: 'Account' }} />
    </Tabs>
  );
}
