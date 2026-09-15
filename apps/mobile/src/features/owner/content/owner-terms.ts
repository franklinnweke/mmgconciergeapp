import {
  CURRENT_COMMISSION_TERMS_VERSION,
  CURRENT_OWNER_TERMS_VERSION,
  CURRENT_PRIVACY_NOTICE_VERSION,
} from '@mmg/contracts';

export const OWNER_TERMS_SUMMARY = {
  version: CURRENT_OWNER_TERMS_VERSION,
  title: 'MMG Concierge Host Operating Agreement',
  summary:
    'As an MMG vehicle host in Lagos, you agree to maintain your vehicle to premium safety standards, keep valid Nigerian registration, provide truthful vehicle information, and honor confirmed concierge bookings.',
};

export const COMMISSION_TERMS_SUMMARY = {
  version: CURRENT_COMMISSION_TERMS_VERSION,
  title: 'Commission & settlement terms',
  summary:
    'MMG Concierge applies the commission stated in the current owner terms. Booking earnings and any settlement steps are confirmed through MMG operations; this app does not promise an automated payout method.',
};

export const PRIVACY_NOTICE_SUMMARY = {
  version: CURRENT_PRIVACY_NOTICE_VERSION,
  title: 'Host Privacy & Identity Data Notice',
  summary:
    'Government identification documents are collected for owner verification and fraud prevention. ID images stay private, are never shown to renters, and are deleted after the final verification decision while verification and audit metadata is retained.',
};
