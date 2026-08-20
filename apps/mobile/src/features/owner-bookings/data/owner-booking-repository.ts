import {
  collection,
  getFirestore,
  onSnapshot,
  query,
  where,
} from "@react-native-firebase/firestore";

import { parseOwnerBooking } from "../domain/owner-booking";
import type { OwnerVisibleBooking } from "@mmg/contracts";

export type OwnerBookingSource = "live" | "development_fixture" | "unavailable";
export type OwnerBookingSnapshot = {
  bookings: OwnerVisibleBooking[];
  skippedInvalidCount: number;
  source: OwnerBookingSource;
};
export type OwnerBookingRepository = {
  subscribe(
    ownerId: string,
    onSnapshot: (snapshot: OwnerBookingSnapshot) => void,
    onError: (error: Error) => void,
  ): () => void;
};

export class NativeOwnerBookingRepository implements OwnerBookingRepository {
  subscribe(
    ownerId: string,
    emit: (snapshot: OwnerBookingSnapshot) => void,
    onError: (error: Error) => void,
  ): () => void {
    const bookings = collection(getFirestore(), "bookings");
    // Owner equality scope is deliberate. Sort is not server-authoritative and
    // is intentionally omitted until a public updatedAt field is added to the DTO.
    const scoped = query(bookings, where("ownerId", "==", ownerId));
    return onSnapshot(
      scoped,
      (snapshot) => {
        const parsed: OwnerVisibleBooking[] = [];
        let skippedInvalidCount = 0;
        snapshot.forEach((document) => {
          const booking = parseOwnerBooking(
            document.id,
            document.data(),
            ownerId,
          );
          if (booking) parsed.push(booking);
          else skippedInvalidCount += 1;
        });
        emit({ bookings: parsed, skippedInvalidCount, source: "live" });
      },
      onError,
    );
  }
}

export const createOwnerBookingRepository = (): OwnerBookingRepository =>
  new NativeOwnerBookingRepository();
