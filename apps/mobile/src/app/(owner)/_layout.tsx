import { Stack } from 'expo-router';

import { useTheme } from '../../core/theme';
import { SessionRouteGuard } from '../../features/auth/components/session-route-guard';
import { OwnerIdUploadProvider } from '../../features/owner/domain/owner-id-upload-context';

export default function OwnerLayout() {
  const { colors } = useTheme();
  return (
    <SessionRouteGuard expected="owner">
      <OwnerIdUploadProvider>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />
      </OwnerIdUploadProvider>
    </SessionRouteGuard>
  );
}
