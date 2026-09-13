import { OwnerProfileReadGuard } from '@/features/owner/components/owner-profile-read-guard';
import { OwnerIdentityScreen } from '@/features/owner/screens/owner-identity-screen';

export default function OwnerIdentityRoute() {
  return (
    <OwnerProfileReadGuard>
      <OwnerIdentityScreen />
    </OwnerProfileReadGuard>
  );
}
