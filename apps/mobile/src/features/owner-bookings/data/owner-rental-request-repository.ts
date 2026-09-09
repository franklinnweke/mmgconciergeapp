import { ownerVisibleRentalRequestSchema, type OwnerVisibleRentalRequest } from '@mmg/contracts/rental-request';
import { collection, getFirestore, onSnapshot, query, where } from '@react-native-firebase/firestore';

function iso(value: unknown): string | undefined {
  if (typeof value === 'string') return new Date(value).toISOString();
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as { toDate?: () => Date };
  return typeof candidate.toDate === 'function' ? candidate.toDate().toISOString() : undefined;
}

export type OwnerRentalRequestSnapshot = { requests: OwnerVisibleRentalRequest[]; skippedInvalidCount: number };

export class OwnerRentalRequestRepository {
  subscribe(ownerId: string, emit: (snapshot: OwnerRentalRequestSnapshot) => void, onError: (error: Error) => void): () => void {
    const scoped = query(collection(getFirestore(), 'rentalRequests'), where('ownerId', '==', ownerId));
    return onSnapshot(scoped, (snapshot) => {
      const requests: OwnerVisibleRentalRequest[] = [];
      let skippedInvalidCount = 0;
      snapshot.forEach((document) => {
        const raw = document.data() as Record<string, unknown>;
        const parsed = ownerVisibleRentalRequestSchema.safeParse({
          ...raw,
          requestId: typeof raw.requestId === 'string' ? raw.requestId : document.id,
          createdAt: iso(raw.createdAt), updatedAt: iso(raw.updatedAt),
          ...(raw.holdExpiresAt === undefined ? {} : { holdExpiresAt: iso(raw.holdExpiresAt) }),
        });
        if (parsed.success) requests.push(parsed.data); else skippedInvalidCount += 1;
      });
      requests.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      emit({ requests, skippedInvalidCount });
    }, onError);
  }
}
