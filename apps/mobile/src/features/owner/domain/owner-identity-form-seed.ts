import {
  CURRENT_COMMISSION_TERMS_VERSION,
  CURRENT_OWNER_TERMS_VERSION,
  CURRENT_PRIVACY_NOTICE_VERSION,
  type OwnerVisibleProfile,
} from '@mmg/contracts';

export type OwnerIdentityHydrationProfile = Pick<
  OwnerVisibleProfile,
  | 'ownerId'
  | 'legalName'
  | 'address'
  | 'ownerTermsVersion'
  | 'commissionTermsVersion'
  | 'privacyNoticeVersion'
  | 'termsAcceptedAt'
>;

export type OwnerIdentityFormSeed = {
  ownerId: string;
  legalName: string;
  areaLabel: OwnerVisibleProfile['address']['areaLabel'];
  line1: string;
  line2: string;
  termsAccepted: boolean;
  commissionAccepted: boolean;
  privacyAccepted: boolean;
};

export function createOwnerIdentityFormSeed(
  profile: OwnerIdentityHydrationProfile,
): OwnerIdentityFormSeed {
  const hasAcceptance = Boolean(profile.termsAcceptedAt);

  return {
    ownerId: profile.ownerId,
    legalName: profile.legalName,
    areaLabel: profile.address.areaLabel,
    line1: profile.address.line1,
    line2: profile.address.line2 ?? '',
    termsAccepted: hasAcceptance && profile.ownerTermsVersion === CURRENT_OWNER_TERMS_VERSION,
    commissionAccepted:
      hasAcceptance && profile.commissionTermsVersion === CURRENT_COMMISSION_TERMS_VERSION,
    privacyAccepted:
      hasAcceptance && profile.privacyNoticeVersion === CURRENT_PRIVACY_NOTICE_VERSION,
  };
}
