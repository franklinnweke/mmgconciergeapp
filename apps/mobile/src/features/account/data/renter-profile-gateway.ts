import {
  CompleteRenterProfileCommand,
  CompleteRenterProfileData,
  CompleteRenterProfileResult,
  RenterProfileRecord,
  RequestAccountDeletionCommand,
  RequestAccountDeletionData,
  RequestAccountDeletionResult,
  completeRenterProfileCommandSchema,
  completeRenterProfileResultSchema,
  requestAccountDeletionCommandSchema,
  requestAccountDeletionResultSchema,
} from '@mmg/contracts';
import {
  doc,
  getDoc,
  getFirestore,
} from '@react-native-firebase/firestore';
import {
  getFunctions,
  httpsCallable,
} from '@react-native-firebase/functions';

import { parseCallableResult } from '@/core/firebase/parse-callable-result';

function generateIdempotencyKey(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

export interface RenterProfileGateway {
  getRenterProfile(renterId: string): Promise<RenterProfileRecord | null>;
  completeProfile(data: CompleteRenterProfileData): Promise<CompleteRenterProfileResult>;
  requestDeletion(data: RequestAccountDeletionData): Promise<RequestAccountDeletionResult>;
}

export class NativeRenterProfileGateway implements RenterProfileGateway {
  private get firestore() {
    return getFirestore();
  }

  private get functions() {
    return getFunctions(undefined, 'africa-south1');
  }

  async getRenterProfile(renterId: string): Promise<RenterProfileRecord | null> {
    const docRef = doc(this.firestore, 'renterProfiles', renterId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const d = snap.data();
    if (!d) return null;

    return {
      renterId: d.renterId ?? renterId,
      fullName: d.fullName ?? '',
      email: d.email ?? '',
      phone: d.phone ?? '',
      defaultDeliveryAddress: d.defaultDeliveryAddress ?? {
        streetAddress: '',
        areaLabel: 'Victoria Island',
      },
      acceptedRenterTermsVersion: d.acceptedRenterTermsVersion ?? '2026-03-01',
      acceptedPrivacyNoticeVersion: d.acceptedPrivacyNoticeVersion ?? '2026-03-01',
      accountStatus: d.accountStatus ?? 'active',
      deletionReason: d.deletionReason ?? null,
      deletionRequestedAt: d.deletionRequestedAt?.toDate?.()?.toISOString?.() ?? d.deletionRequestedAt ?? null,
      profileVersion: typeof d.profileVersion === 'number' ? d.profileVersion : 1,
      createdAt: d.createdAt?.toDate?.()?.toISOString?.() ?? d.createdAt ?? new Date().toISOString(),
      updatedAt: d.updatedAt?.toDate?.()?.toISOString?.() ?? d.updatedAt ?? new Date().toISOString(),
    };
  }

  async completeProfile(data: CompleteRenterProfileData): Promise<CompleteRenterProfileResult> {
    const command: CompleteRenterProfileCommand = {
      schemaVersion: 1,
      idempotencyKey: generateIdempotencyKey('idemp_renter_prof'),
      data,
    };

    const validated = completeRenterProfileCommandSchema.parse(command);
    const call = httpsCallable(this.functions, 'completeRenterProfile');
    const response = await call(validated);
    return parseCallableResult(completeRenterProfileResultSchema, response.data, 'completeRenterProfile');
  }

  async requestDeletion(data: RequestAccountDeletionData): Promise<RequestAccountDeletionResult> {
    const command: RequestAccountDeletionCommand = {
      schemaVersion: 1,
      idempotencyKey: generateIdempotencyKey('idemp_renter_del'),
      data,
    };

    const validated = requestAccountDeletionCommandSchema.parse(command);
    const call = httpsCallable(this.functions, 'requestAccountDeletion');
    const response = await call(validated);
    return parseCallableResult(requestAccountDeletionResultSchema, response.data, 'requestAccountDeletion');
  }
}

export function createRenterProfileGateway(): RenterProfileGateway {
  return new NativeRenterProfileGateway();
}
