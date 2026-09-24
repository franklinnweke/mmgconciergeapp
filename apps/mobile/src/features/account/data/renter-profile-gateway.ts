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

import { parseCallableResult } from '../../../core/firebase/parse-callable-result';
import {
  RenterProfileError,
  parseRenterProfileDocument,
} from './renter-profile-record';

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
    let snap;
    try {
      const docRef = doc(this.firestore, 'renterProfiles', renterId);
      snap = await getDoc(docRef);
    } catch (err) {
      if (err instanceof RenterProfileError) throw err;
      const errorObj = (err && typeof err === 'object' ? err : {}) as { code?: unknown };
      const rawCode = String(errorObj.code ?? '');
      const code = rawCode.split('/').pop()?.toLowerCase() ?? '';
      if (code === 'permission-denied' || code === 'forbidden') {
        throw new RenterProfileError(
          'profile_permission_denied',
          'Failed to load profile: permission denied.',
          err,
        );
      }
      if (code === 'unavailable' || code === 'network-request-failed') {
        throw new RenterProfileError(
          'profile_unavailable',
          'Failed to load profile: network or service unavailable.',
          err,
        );
      }
      throw new RenterProfileError(
        'profile_read_failed',
        'Failed to read renter profile from database.',
        err,
      );
    }

    if (!snap.exists()) return null;
    const data = snap.data();
    if (!data) return null;
    return parseRenterProfileDocument(renterId, data as Record<string, unknown>);
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
