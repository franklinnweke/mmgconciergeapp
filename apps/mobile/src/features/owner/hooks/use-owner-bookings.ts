import { OwnerRejectReason, RenterVisibleBooking } from '@mmg/contracts';
import {
  collection,
  getFirestore,
  onSnapshot,
  query,
  where,
  type DocumentSnapshot,
  type QuerySnapshot,
} from '@react-native-firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/core/auth/auth-context';
import { createBookingPaymentGateway } from '@/features/booking/data/booking-payment-gateway';

export function useOwnerBookings() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<RenterVisibleBooking[]>([]);
  const [loading, setLoading] = useState(Boolean(user?.uid));
  const [actionInProgress, setActionInProgress] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const gateway = useMemo(() => createBookingPaymentGateway(), []);
  const uid = user?.uid;

  useEffect(() => {
    if (!uid) {
      return;
    }

    const db = getFirestore();
    const q = query(collection(db, 'bookings'), where('ownerId', '==', uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot: QuerySnapshot) => {
        const loaded: RenterVisibleBooking[] = [];
        snapshot.forEach((docSnap: DocumentSnapshot) => {
          const data = docSnap.data() as any;
          if (!data) return;
          loaded.push({
            id: docSnap.id,
            intentId: data.intentId,
            renterId: data.renterId,
            ownerId: data.ownerId,
            vehicleId: data.vehicleId,
            startDate: data.startDate,
            endDate: data.endDate,
            state: data.state,
            priceSnapshot: data.priceSnapshot,
            vehicleSnapshot: data.vehicleSnapshot,
            createdAt: data.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
            updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
          });
        });

        loaded.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setBookings(loaded);
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [uid]);

  const pendingBookings = useMemo(
    () => bookings.filter((b) => b.state === 'paid_pending_owner'),
    [bookings],
  );

  const confirmedBookings = useMemo(
    () => bookings.filter((b) => b.state === 'confirmed' || b.state === 'in_progress'),
    [bookings],
  );

  const confirmBooking = useCallback(
    async (bookingId: string, expectedVersion = 1, chauffeurNotes?: string) => {
      setActionInProgress(true);
      setActionError(null);
      try {
        await gateway.ownerConfirmBooking({
          bookingId,
          expectedVersion,
          chauffeurNotes,
        });
      } catch (err: any) {
        setActionError(err?.message || 'Could not confirm booking.');
        throw err;
      } finally {
        setActionInProgress(false);
      }
    },
    [gateway],
  );

  const rejectBooking = useCallback(
    async (
      bookingId: string,
      reason: OwnerRejectReason,
      expectedVersion = 1,
      details?: string,
    ) => {
      setActionInProgress(true);
      setActionError(null);
      try {
        await gateway.ownerRejectBooking({
          bookingId,
          expectedVersion,
          reason,
          details,
        });
      } catch (err: any) {
        setActionError(err?.message || 'Could not decline booking.');
        throw err;
      } finally {
        setActionInProgress(false);
      }
    },
    [gateway],
  );

  return {
    bookings,
    pendingBookings,
    confirmedBookings,
    loading,
    actionInProgress,
    actionError,
    confirmBooking,
    rejectBooking,
  };
}
