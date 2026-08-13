import { BookingOperations } from '@/features/bookings/components/booking-operations';

export default function OperationsPage() {
  const fixtureMode = process.env.NODE_ENV !== 'production' &&
    process.env.MMG_ADMIN_FIXTURES === '1';
  return <BookingOperations mode={fixtureMode ? 'fixture' : 'unavailable'} />;
}
