import { OwnerProfileReadGuard } from '@/features/owner/components/owner-profile-read-guard';
import { OwnerPhoneScreen } from '@/features/owner/screens/owner-phone-screen';

export default function OwnerPhoneRoute() {
  return (
    <OwnerProfileReadGuard>
      <OwnerPhoneScreen />
    </OwnerProfileReadGuard>
  );
}
