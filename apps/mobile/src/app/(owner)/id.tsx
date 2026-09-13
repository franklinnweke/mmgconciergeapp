import { OwnerProfileReadGuard } from '@/features/owner/components/owner-profile-read-guard';
import { OwnerIdScreen } from '@/features/owner/screens/owner-id-screen';

export default function GovernmentIdRoute() {
  return <OwnerProfileReadGuard><OwnerIdScreen /></OwnerProfileReadGuard>;
}
