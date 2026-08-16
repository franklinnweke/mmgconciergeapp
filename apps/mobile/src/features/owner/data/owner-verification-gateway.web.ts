import type {
  CompleteOwnerProfileCommand,
  CompleteOwnerProfileResult,
  SubmitOwnerVerificationCommand,
  SubmitOwnerVerificationResult,
} from '@mmg/contracts';

import type {
  OwnerVerificationGateway,
  PhoneConfirmationSession,
  UploadedIdMetadata,
} from './owner-verification-gateway';

export class WebOwnerVerificationGateway implements OwnerVerificationGateway {
  async completeOwnerProfile(
    command: CompleteOwnerProfileCommand,
  ): Promise<CompleteOwnerProfileResult> {
    return {
      requestId: 'web-req-profile-01',
      result: {
        ownerId: 'preview-owner-01',
        verificationStatus: 'draft',
        profileVersion: 1,
      },
    };
  }

  async submitOwnerVerification(
    command: SubmitOwnerVerificationCommand,
  ): Promise<SubmitOwnerVerificationResult> {
    return {
      requestId: 'web-req-submit-01',
      result: {
        ownerId: 'preview-owner-01',
        verificationStatus: 'submitted',
        submittedAt: new Date().toISOString(),
        receiptId: 'preview-owner-01',
      },
    };
  }

  async uploadPrivateIdDocument(
    ownerId: string,
    uploadId: string,
    _fileUri: string,
    contentType: string,
  ): Promise<UploadedIdMetadata> {
    return {
      uploadId,
      storagePath: `private/owner-verification/${ownerId}/${uploadId}`,
      contentType: contentType || 'image/jpeg',
      byteSize: 1024 * 1024,
      uploadedAt: new Date().toISOString(),
    };
  }

  async requestPhoneVerification(
    _phoneE164: string,
  ): Promise<PhoneConfirmationSession> {
    throw new Error('PHONE VERIFICATION REQUIRES THE NATIVE APP');
  }

  async confirmPhoneVerification(
    _session: PhoneConfirmationSession,
    _code: string,
  ): Promise<void> {
    throw new Error('PHONE VERIFICATION REQUIRES THE NATIVE APP');
  }
}

export function createOwnerVerificationGateway(): OwnerVerificationGateway {
  return new WebOwnerVerificationGateway();
}
