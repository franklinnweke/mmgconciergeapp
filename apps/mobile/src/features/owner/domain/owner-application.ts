import {
  CURRENT_COMMISSION_TERMS_VERSION,
  CURRENT_OWNER_TERMS_VERSION,
  CURRENT_PRIVACY_NOTICE_VERSION,
  type GovernmentIdKind,
  type OwnerVerificationStatus,
  type OwnerVisibleProfile,
} from '@mmg/contracts';
import { isCurrentTerms } from '@mmg/domain';

export type LocalUploadedDocument = {
  uploadId: string;
  documentKind: GovernmentIdKind;
  originalFileName: string;
  contentType: string;
  byteSize: number;
  uploadedAt: string;
};

export type OwnerApplicationStep = 'identity' | 'phone' | 'id' | 'submit';

export type StepCompleteness = {
  emailVerified: boolean;
  identityComplete: boolean;
  phoneComplete: boolean;
  idUploaded: boolean;
  canSubmit: boolean;
  firstIncompleteStep: OwnerApplicationStep | null;
  identityUnlocked: boolean;
  phoneUnlocked: boolean;
  idUnlocked: boolean;
  submitUnlocked: boolean;
};

export type DeskPresentation = {
  status: OwnerVerificationStatus;
  eyebrow: string;
  title: string;
  body: string;
  primaryAction: {
    label: string;
    route: '/(owner)/identity' | '/(owner)/phone' | '/(owner)/id' | '/(owner)/submit' | '/(owner)/fleet';
  } | null;
  lastDecisionReason: string | null;
  showChecklist: boolean;
};

export function isOwnerApplicationEditable(
  status: OwnerVerificationStatus | null | undefined,
): boolean {
  return !status || status === 'draft' || status === 'rejected';
}

export function hasCurrentOwnerAgreements(
  profile: Pick<
    OwnerVisibleProfile,
    'termsAcceptedAt' | 'ownerTermsVersion' | 'commissionTermsVersion' | 'privacyNoticeVersion'
  > | null | undefined,
): boolean {
  if (!profile?.termsAcceptedAt) return false;
  return isCurrentTerms(
    {
      ownerTermsVersion: profile.ownerTermsVersion ?? '',
      commissionTermsVersion: profile.commissionTermsVersion ?? '',
      privacyNoticeVersion: profile.privacyNoticeVersion ?? '',
    },
    {
      ownerTermsVersion: CURRENT_OWNER_TERMS_VERSION,
      commissionTermsVersion: CURRENT_COMMISSION_TERMS_VERSION,
      privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
    },
  );
}

type DeskCompleteness = Pick<
  StepCompleteness,
  'canSubmit' | 'firstIncompleteStep'
> & Partial<Omit<StepCompleteness, 'canSubmit' | 'firstIncompleteStep'>>;

export function isNigerianE164(phone: string | null | undefined): boolean {
  if (!phone) return false;
  return /^\+234[789]\d{9}$/.test(phone.trim());
}

export function normalizeNigerianPhone(input: string): string | null {
  const digitsOnly = input.replace(/\D/g, '');
  if (digitsOnly.length === 10 && /^[789]\d{9}$/.test(digitsOnly)) {
    return `+234${digitsOnly}`;
  }
  if (digitsOnly.length === 11 && /^0[789]\d{9}$/.test(digitsOnly)) {
    return `+234${digitsOnly.substring(1)}`;
  }
  if (digitsOnly.length === 13 && /^234[789]\d{9}$/.test(digitsOnly)) {
    return `+${digitsOnly}`;
  }
  return null;
}

export function getStepLockReason(
  step: OwnerApplicationStep,
  completeness: StepCompleteness,
): string | null {
  switch (step) {
    case 'identity':
      if (!completeness.emailVerified) {
        return 'Verify your email address before setting up owner identity.';
      }
      return null;
    case 'phone':
      if (!completeness.emailVerified) {
        return 'Verify your email address before linking a phone number.';
      }
      if (!completeness.identityComplete) {
        return 'Complete owner identity and accept current agreements first.';
      }
      return null;
    case 'id':
      if (!completeness.emailVerified) {
        return 'Verify your email address before uploading identification.';
      }
      if (!completeness.identityComplete) {
        return 'Complete owner identity and accept current agreements first.';
      }
      if (!completeness.phoneComplete) {
        return 'Verify your Nigerian phone number first.';
      }
      return null;
    case 'submit':
      if (!completeness.canSubmit) {
        return 'Complete all required steps before submitting.';
      }
      return null;
  }
}

/**
 * A rejected application cannot reuse the prior identity document: rejection
 * schedules the private bytes for deletion and the server requires a fresh upload.
 * Draft applications can reuse an already-uploaded document that is not cleared.
 */
export function canReusePersistedGovernmentId(
  profile: Pick<OwnerVisibleProfile, 'verificationStatus' | 'governmentId'> | null | undefined,
): boolean {
  if (!profile || profile.verificationStatus === 'rejected') return false;
  return Boolean(
    profile.governmentId?.uploadId && profile.governmentId.status !== 'cleared',
  );
}

export function computeOwnerIdScreenState({
  profile,
  phoneNumber,
  emailVerified,
  hasSelectedAsset,
}: {
  profile: OwnerVisibleProfile | null | undefined;
  phoneNumber: string | null | undefined;
  emailVerified: boolean;
  hasSelectedAsset: boolean;
}) {
  const agreementsCurrent = hasCurrentOwnerAgreements(profile);
  const identityComplete = Boolean(
    profile?.legalName &&
      profile?.address?.line1 &&
      profile?.address?.areaLabel &&
      agreementsCurrent,
  );
  const phoneComplete = isNigerianE164(phoneNumber);
  const prerequisitesMet = emailVerified && identityComplete && phoneComplete;
  const editable = isOwnerApplicationEditable(profile?.verificationStatus);
  const hasExistingDocument = canReusePersistedGovernmentId(profile);
  const canContinueToReview = editable && prerequisitesMet && (hasSelectedAsset || hasExistingDocument);

  return {
    agreementsCurrent,
    identityComplete,
    phoneComplete,
    prerequisitesMet,
    editable,
    hasExistingDocument,
    canContinueToReview,
  };
}

export function computeApplicationCompleteness(
  profile: OwnerVisibleProfile | null,
  userPhone: string | null | undefined,
  localUploadedDoc: LocalUploadedDocument | null,
  emailVerified: boolean = false,
): StepCompleteness {
  const agreementsCurrent = hasCurrentOwnerAgreements(profile);
  const identityComplete = Boolean(
    profile?.legalName &&
      profile?.address?.line1 &&
      profile?.address?.areaLabel &&
      agreementsCurrent,
  );

  const phoneComplete = isNigerianE164(userPhone);
  // A rejected application cannot reuse the prior identity document: rejection
  // schedules the private bytes for deletion and the server requires a fresh upload.
  const idUploaded = Boolean(
    localUploadedDoc || canReusePersistedGovernmentId(profile),
  );

  const canSubmit = emailVerified && identityComplete && phoneComplete && idUploaded;

  let firstIncompleteStep: OwnerApplicationStep | null = null;
  if (!identityComplete) {
    firstIncompleteStep = 'identity';
  } else if (!phoneComplete) {
    firstIncompleteStep = 'phone';
  } else if (!idUploaded) {
    firstIncompleteStep = 'id';
  } else {
    firstIncompleteStep = 'submit';
  }

  const identityUnlocked = emailVerified;
  const phoneUnlocked = emailVerified && identityComplete;
  const idUnlocked = emailVerified && identityComplete && phoneComplete;
  const submitUnlocked = canSubmit;

  return {
    emailVerified,
    identityComplete,
    phoneComplete,
    idUploaded,
    canSubmit,
    firstIncompleteStep,
    identityUnlocked,
    phoneUnlocked,
    idUnlocked,
    submitUnlocked,
  };
}

export function getDeskPresentation(
  status: OwnerVerificationStatus | null | undefined,
  completeness: DeskCompleteness,
  lastDecisionReason: string | null = null,
): DeskPresentation {
  const currentStatus: OwnerVerificationStatus = status || 'draft';

  if (currentStatus === 'draft') {
    if (completeness.canSubmit) {
      return {
        status: 'draft',
        eyebrow: 'READY TO SUBMIT',
        title: 'Review and send your file.',
        body: 'All required steps are complete. Review your details and submit your application to the MMG operations desk.',
        primaryAction: {
          label: 'Review and submit',
          route: '/(owner)/submit',
        },
        lastDecisionReason: null,
        showChecklist: true,
      };
    }

    const stepRouteMap: Record<OwnerApplicationStep, '/(owner)/identity' | '/(owner)/phone' | '/(owner)/id' | '/(owner)/submit'> = {
      identity: '/(owner)/identity',
      phone: '/(owner)/phone',
      id: '/(owner)/id',
      submit: '/(owner)/submit',
    };

    return {
      status: 'draft',
      eyebrow: 'OWNER DESK',
      title: 'Prepare your application.',
      body: 'Complete your profile, verify your Nigerian phone number, and securely upload your government identification.',
      primaryAction: {
        label: 'Continue application',
        route: stepRouteMap[completeness.firstIncompleteStep || 'identity'],
      },
      lastDecisionReason: null,
      showChecklist: true,
    };
  }

  if (currentStatus === 'submitted') {
    return {
      status: 'submitted',
      eyebrow: 'SUBMITTED',
      title: 'Your file is with MMG.',
      body: 'We have received your verification application. Our operations team will review your identity documents shortly.',
      primaryAction: null,
      lastDecisionReason: null,
      showChecklist: false,
    };
  }

  if (currentStatus === 'under_review') {
    return {
      status: 'under_review',
      eyebrow: 'UNDER REVIEW',
      title: 'MMG is reviewing your file.',
      body: 'Your identity and address documentation are currently being verified by an operations staff specialist.',
      primaryAction: null,
      lastDecisionReason: null,
      showChecklist: false,
    };
  }

  if (currentStatus === 'approved') {
    return {
      status: 'approved',
      eyebrow: 'APPROVED',
      title: 'You are verified.',
      body: 'Your owner account has been approved. You can now manage your luxury fleet and list vehicles for MMG Concierge moderation.',
      primaryAction: {
        label: 'Manage luxury fleet',
        route: '/(owner)/fleet',
      },
      lastDecisionReason: null,
      showChecklist: false,
    };
  }

  if (currentStatus === 'rejected') {
    return {
      status: 'rejected',
      eyebrow: 'NOT APPROVED',
      title: 'Your application needs changes.',
      body:
        lastDecisionReason ||
        'Your previous submission could not be approved. Please update your details or re-upload your document.',
      primaryAction: {
        label: 'Update application',
        route: '/(owner)/identity',
      },
      lastDecisionReason,
      showChecklist: true,
    };
  }

  if (currentStatus === 'suspended') {
    return {
      status: 'suspended',
      eyebrow: 'SUSPENDED',
      title: 'Your owner account is paused.',
      body:
        lastDecisionReason ||
        'Your owner account has been temporarily suspended. Please contact MMG Concierge support for details.',
      primaryAction: null,
      lastDecisionReason,
      showChecklist: false,
    };
  }

  // revoked
  return {
    status: 'revoked',
    eyebrow: 'REVOKED',
    title: 'This owner account cannot continue.',
    body:
      lastDecisionReason ||
      'This owner account has been permanently revoked by operations.',
    primaryAction: null,
    lastDecisionReason,
    showChecklist: false,
  };
}
