import {
  getAuth,
  getIdToken,
  linkWithCredential,
  PhoneAuthProvider,
  reload,
} from '@react-native-firebase/auth';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import { getStorage, putFile, ref } from '@react-native-firebase/storage';
import {
  completeOwnerProfileResultSchema,
  submitOwnerVerificationResultSchema,
  type CompleteOwnerProfileCommand,
  type CompleteOwnerProfileResult,
  type SubmitOwnerVerificationCommand,
  type SubmitOwnerVerificationResult,
} from '@mmg/contracts';

import { parseCallableResult } from '@/core/firebase/parse-callable-result';

export type UploadedIdMetadata = {
  uploadId: string;
  storagePath: string;
  contentType: string;
  byteSize: number;
  uploadedAt: string;
};

export type PhoneConfirmationSession = {
  verificationId: string;
};

export interface OwnerVerificationGateway {
  completeOwnerProfile(
    command: CompleteOwnerProfileCommand,
  ): Promise<CompleteOwnerProfileResult>;

  submitOwnerVerification(
    command: SubmitOwnerVerificationCommand,
  ): Promise<SubmitOwnerVerificationResult>;

  uploadPrivateIdDocument(
    ownerId: string,
    uploadId: string,
    fileUri: string,
    contentType: string,
  ): Promise<UploadedIdMetadata>;

  requestPhoneVerification(
    phoneE164: string,
  ): Promise<PhoneConfirmationSession>;

  confirmPhoneVerification(
    session: PhoneConfirmationSession,
    code: string,
  ): Promise<void>;
}

export class NativeOwnerVerificationGateway implements OwnerVerificationGateway {
  private readonly functionsInstance = getFunctions(undefined, 'africa-south1');

  async completeOwnerProfile(
    command: CompleteOwnerProfileCommand,
  ): Promise<CompleteOwnerProfileResult> {
    const callable = httpsCallable(this.functionsInstance, 'completeOwnerProfile');
    const response = await callable(command);
    // Validate rather than cast: an unparsed response would let a schema change
    // or a partial payload surface as a confident-looking success in the UI.
    return parseCallableResult(
      completeOwnerProfileResultSchema,
      response.data,
      'completeOwnerProfile',
    );
  }

  async submitOwnerVerification(
    command: SubmitOwnerVerificationCommand,
  ): Promise<SubmitOwnerVerificationResult> {
    const callable = httpsCallable(this.functionsInstance, 'submitOwnerVerification');
    const response = await callable(command);
    return parseCallableResult(
      submitOwnerVerificationResultSchema,
      response.data,
      'submitOwnerVerification',
    );
  }

  async uploadPrivateIdDocument(
    ownerId: string,
    uploadId: string,
    fileUri: string,
    contentType: string,
  ): Promise<UploadedIdMetadata> {
    const storagePath = `private/owner-verification/${ownerId}/${uploadId}`;
    const storageInstance = getStorage();
    const fileRef = ref(storageInstance, storagePath);

    const uploadTask = await putFile(fileRef, fileUri, {
      contentType,
      customMetadata: {
        ownerId,
        purpose: 'government_id',
      },
    });

    const now = new Date().toISOString();
    return {
      uploadId,
      storagePath,
      contentType,
      byteSize: uploadTask.bytesTransferred,
      uploadedAt: now,
    };
  }

  async requestPhoneVerification(
    phoneE164: string,
  ): Promise<PhoneConfirmationSession> {
    const authInstance = getAuth();
    const currentUser = authInstance.currentUser;
    if (!currentUser) {
      throw new Error('Sign in before verifying your phone number.');
    }

    const provider = new PhoneAuthProvider(authInstance);
    // RN Firebase 26 accepts an ApplicationVerifier for JS SDK API parity; native manages verification directly
    const verificationId = await provider.verifyPhoneNumber(phoneE164, {
      type: 'recaptcha',
      verify: async () => '',
    });
    return { verificationId };
  }

  async confirmPhoneVerification(
    session: PhoneConfirmationSession,
    code: string,
  ): Promise<void> {
    const authInstance = getAuth();
    const currentUser = authInstance.currentUser;
    if (!currentUser) {
      throw new Error('Sign in before confirming verification code.');
    }

    const credential = PhoneAuthProvider.credential(session.verificationId, code);
    await linkWithCredential(currentUser, credential);
    await reload(currentUser);
    await getIdToken(currentUser, true);
  }
}

export function createOwnerVerificationGateway(): OwnerVerificationGateway {
  return new NativeOwnerVerificationGateway();
}
