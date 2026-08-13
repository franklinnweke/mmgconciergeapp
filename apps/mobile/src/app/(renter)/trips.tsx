import { FoundationScreen } from '@/components/foundation-screen';

export default function TripsScreen() {
  return (
    <FoundationScreen
      action="Explore the fleet"
      actionHref="/(renter)"
      body="Confirmed rides, payment updates, and concierge notes stay together from pickup to completion."
      eyebrow="YOUR JOURNEYS"
      icon="calendar-clear-outline"
      title="Every detail, in one calm timeline."
    />
  );
}
