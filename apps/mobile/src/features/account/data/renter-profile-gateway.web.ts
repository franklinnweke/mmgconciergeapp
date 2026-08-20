import {
  CompleteRenterProfileCommand,
  CompleteRenterProfileData,
  CompleteRenterProfileResult,
  RenterProfileRecord,
  RequestAccountDeletionCommand,
  RequestAccountDeletionData,
  RequestAccountDeletionResult,
  completeRenterProfileCommandSchema,
  requestAccountDeletionCommandSchema,
} from '@mmg/contracts';
import {
  doc,
  getDoc,
  getFirestore,
  type Firestore,
} from 'firebase/firestore';
import {
  getFunctions,
  httpsCallable,
  type Functions,
} from 'firebase/functions';

import { RenterProfileGateway } from './renter-profile-gateway';

export const PREVIEW_RENTER_PROFILE: RenterProfileRecord = {
  renterId: 'preview-renter',
  fullName: 'Preview Guest',
  email: 'preview@mmgconcierge.local',
  phone: '+2348000000000',
  defaultDeliveryAddress: {
    streetAddress: '15 Queens Drive, Ikoyi',
    areaLabel: 'Victoria Island',
  },
  acceptedRenterTermsVersion: '2026-03-01',
  acceptedPrivacyNoticeVersion: '2026-03-01',
  accountStatus: 'active',
  deletionReason: null,
  deletionRequestedAt: null,
  profileVersion: 1,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

function generateIdempotencyKey(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

export class WebRenterProfileGateway implements RenterProfileGateway {
  private customFirestore?: Firestore;
  private customFunctions?: Functions;

  constructor(firestore?: Firestore, functions?: Functions) {
    this.customFirestore = firestore;
    this.customFunctions = functions;
  }

  private get firestore(): Firestore {
    return this.customFirestore ?? getFirestore();
  }

  private get functions(): Functions {
    return this.customFunctions ?? getFunctions(undefined, 'africa-south1');
  }

  async getRenterProfile(renterId: string): Promise<RenterProfileRecord | null> {
    const docRef = doc(this.firestore, 'renterProfiles', renterId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const d = snap.data();
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
    const call = httpsCallable<CompleteRenterProfileCommand, CompleteRenterProfileResult>(
      this.functions,
      'completeRenterProfile',
    );
    const response = await call(validated);
    return response.data;
  }

  async requestDeletion(data: RequestAccountDeletionData): Promise<RequestAccountDeletionResult> {
    const command: RequestAccountDeletionCommand = {
      schemaVersion: 1,
      idempotencyKey: generateIdempotencyKey('idemp_renter_del'),
      data,
    };

    const validated = requestAccountDeletionCommandSchema.parse(command);
    const call = httpsCallable<RequestAccountDeletionCommand, RequestAccountDeletionResult>(
      this.functions,
      'requestAccountDeletion',
    );
    const response = await call(validated);
    return response.data;
  }
}

export class PreviewRenterProfileGateway implements RenterProfileGateway {
  async getRenterProfile(renterId: string): Promise<RenterProfileRecord | null> {
    return renterId === PREVIEW_RENTER_PROFILE.renterId ? PREVIEW_RENTER_PROFILE : null;
  }

  async completeProfile(): Promise<CompleteRenterProfileResult> {
    throw new Error('Profile changes are unavailable in web preview mode. Use a native development build.');
  }

  async requestDeletion(): Promise<RequestAccountDeletionResult> {
    throw new Error('Account deletion is unavailable in web preview mode. Use a native development build.');
  }
}

export function createRenterProfileGateway(firestore?: Firestore, functions?: Functions): RenterProfileGateway {
  if (firestore || functions) {
    return new WebRenterProfileGateway(firestore, functions);
  }
  return new PreviewRenterProfileGateway();
}
