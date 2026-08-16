import {
  CURRENT_COMMISSION_TERMS_VERSION,
  CURRENT_OWNER_TERMS_VERSION,
  CURRENT_PRIVACY_NOTICE_VERSION,
} from '@mmg/contracts';

export const OWNER_TERMS_SUMMARY = {
  version: CURRENT_OWNER_TERMS_VERSION,
  title: 'MMG Concierge Host Operating Agreement',
  summary:
    'As an MMG vehicle host in Lagos, you agree to maintain your vehicle to premium safety standards, ensure valid Nigerian registration, provide truthful vehicle documentation, and honor confirmed bookings with concierge clients.',
};

export const COMMISSION_TERMS_SUMMARY = {
  version: CURRENT_COMMISSION_TERMS_VERSION,
  title: 'Commission & Payout Schedule',
  summary:
    'MMG Concierge applies a standard 15% platform service commission on all completed concierge bookings. Net owner payouts are disbursed in Nigerian Naira (NGN) directly to your verified local commercial bank account.',
};

export const PRIVACY_NOTICE_SUMMARY = {
  version: CURRENT_PRIVACY_NOTICE_VERSION,
  title: 'Host Privacy & Identity Data Notice',
  summary:
    'Government identification documents (NIN, Driver’s Licence, International Passport, or Voter’s Card) are collected strictly for anti-fraud verification and compliance with Nigerian regulations. ID images are stored in a private vault, never shown to renters or published publicly.',
};
