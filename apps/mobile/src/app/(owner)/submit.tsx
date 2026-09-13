import { OwnerProfileReadGuard } from '@/features/owner/components/owner-profile-read-guard';
import { OwnerSubmitScreen } from '@/features/owner/screens/owner-submit-screen';

export default function OwnerSubmitRoute() {
  return (
    <OwnerProfileReadGuard>
      <OwnerSubmitScreen />
    </OwnerProfileReadGuard>
  );
}
