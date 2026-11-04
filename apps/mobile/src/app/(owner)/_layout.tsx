import { Stack } from 'expo-router';

import { SessionRouteGuard } from '../../features/auth/components/session-route-guard';
import { OwnerIdUploadProvider } from '../../features/owner/domain/owner-id-upload-context';

export default function OwnerLayout() {
  return (
    <SessionRouteGuard expected="owner">
      <OwnerIdUploadProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </OwnerIdUploadProvider>
    </SessionRouteGuard>
  );
}
