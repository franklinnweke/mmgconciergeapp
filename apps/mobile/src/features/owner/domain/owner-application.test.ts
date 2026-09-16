import { describe, expect, it } from 'vitest';
import {
  CURRENT_COMMISSION_TERMS_VERSION,
  CURRENT_OWNER_TERMS_VERSION,
  CURRENT_PRIVACY_NOTICE_VERSION,
  type OwnerVisibleProfile,
} from '@mmg/contracts';

import {
  computeApplicationCompleteness,
  getDeskPresentation,
  getStepLockReason,
  isOwnerApplicationEditable,
  isNigerianE164,
  normalizeNigerianPhone,
} from './owner-application.js';
import { ownerCommandErrorMessage } from './owner-errors.js';

describe('owner application domain', () => {
  it('allows edits only for draft and rejected owner applications', () => {
    expect(isOwnerApplicationEditable(undefined)).toBe(true);
    expect(isOwnerApplicationEditable('draft')).toBe(true);
    expect(isOwnerApplicationEditable('rejected')).toBe(true);
    expect(isOwnerApplicationEditable('submitted')).toBe(false);
    expect(isOwnerApplicationEditable('under_review')).toBe(false);
    expect(isOwnerApplicationEditable('approved')).toBe(false);
    expect(isOwnerApplicationEditable('suspended')).toBe(false);
  });

  describe('Nigerian phone validation and normalization', () => {
    it('validates Nigerian E.164 phone numbers', () => {
      expect(isNigerianE164('+2348012345678')).toBe(true);
      expect(isNigerianE164('+2347098765432')).toBe(true);
      expect(isNigerianE164('+2349011223344')).toBe(true);

      expect(isNigerianE164('08012345678')).toBe(false);
      expect(isNigerianE164('+1234567890')).toBe(false);
      expect(isNigerianE164(null)).toBe(false);
      expect(isNigerianE164('')).toBe(false);
    });

    it('normalizes local 10/11 digit inputs to +234 E.164 format', () => {
      expect(normalizeNigerianPhone('08012345678')).toBe('+2348012345678');
      expect(normalizeNigerianPhone('8012345678')).toBe('+2348012345678');
      expect(normalizeNigerianPhone('+234 801 234 5678')).toBe('+2348012345678');
      expect(normalizeNigerianPhone('070-9876-5432')).toBe('+2347098765432');
      expect(normalizeNigerianPhone('invalid')).toBeNull();
    });
  });

  describe('computeApplicationCompleteness', () => {
    const mockProfile: OwnerVisibleProfile = {
      ownerId: 'owner-1',
      legalName: 'Alhaji Musa Danjuma',
      displayName: 'Alhaji Musa Danjuma',
      address: {
        line1: '14 Admiralty Way',
        areaLabel: 'Lekki Phase 1',
        city: 'Lagos',
        country: 'NG',
      },
      verificationStatus: 'draft',
      verificationUpdatedAt: '2026-08-15T12:00:00.000Z',
      lastDecisionReason: null,
      ownerTermsVersion: CURRENT_OWNER_TERMS_VERSION,
      commissionTermsVersion: CURRENT_COMMISSION_TERMS_VERSION,
      privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
      termsAcceptedAt: '2026-08-15T12:00:00.000Z',
      governmentId: null,
      createdAt: '2026-08-15T12:00:00.000Z',
      updatedAt: '2026-08-15T12:00:00.000Z',
      version: 1,
    };

    const uploadedDocument = {
      uploadId: 'upload-123',
      documentKind: 'national_id' as const,
      originalFileName: 'nin.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
      uploadedAt: '2026-08-15T12:00:00.000Z',
    };

    it('returns identity incomplete when profile is null', () => {
      const completeness = computeApplicationCompleteness(null, null, null, true);
      expect(completeness.identityComplete).toBe(false);
      expect(completeness.canSubmit).toBe(false);
      expect(completeness.firstIncompleteStep).toBe('identity');
    });

    it('fails closed while email verification is unknown', () => {
      const completeness = computeApplicationCompleteness(
        mockProfile,
        '+2348012345678',
        uploadedDocument,
      );

      expect(completeness.emailVerified).toBe(false);
      expect(completeness.canSubmit).toBe(false);
      expect(completeness.identityUnlocked).toBe(false);
    });

    it('returns phone incomplete when profile is complete but phone is unverified', () => {
      const completeness = computeApplicationCompleteness(mockProfile, null, null, true);
      expect(completeness.identityComplete).toBe(true);
      expect(completeness.phoneComplete).toBe(false);
      expect(completeness.firstIncompleteStep).toBe('phone');
    });

    it('returns id incomplete when profile and phone are verified but document is missing', () => {
      const completeness = computeApplicationCompleteness(mockProfile, '+2348012345678', null, true);
      expect(completeness.identityComplete).toBe(true);
      expect(completeness.phoneComplete).toBe(true);
      expect(completeness.idUploaded).toBe(false);
      expect(completeness.firstIncompleteStep).toBe('id');
    });

    it('returns canSubmit true when all steps are completed', () => {
      const completeness = computeApplicationCompleteness(
        mockProfile,
        '+2348012345678',
        uploadedDocument,
        true,
      );
      expect(completeness.canSubmit).toBe(true);
      expect(completeness.firstIncompleteStep).toBe('submit');
      expect(completeness.submitUnlocked).toBe(true);
    });

    it('requires a fresh local ID upload after owner verification is rejected', () => {
      const rejectedProfile: OwnerVisibleProfile = {
        ...mockProfile,
        verificationStatus: 'rejected',
        governmentId: {
          uploadId: 'old-rejected-upload',
          documentKind: 'national_id',
          contentType: 'image/jpeg',
          byteSize: 1024,
          uploadedAt: '2026-08-15T12:00:00.000Z',
          status: 'rejected',
        },
      };

      const withoutReplacement = computeApplicationCompleteness(
        rejectedProfile,
        '+2348012345678',
        null,
        true,
      );
      expect(withoutReplacement.idUploaded).toBe(false);
      expect(withoutReplacement.canSubmit).toBe(false);
      expect(withoutReplacement.firstIncompleteStep).toBe('id');

      const withReplacement = computeApplicationCompleteness(
        rejectedProfile,
        '+2348012345678',
        uploadedDocument,
        true,
      );
      expect(withReplacement.idUploaded).toBe(true);
      expect(withReplacement.canSubmit).toBe(true);
      expect(withReplacement.firstIncompleteStep).toBe('submit');
    });

    it('enforces sequential prerequisite unlocking', () => {
      const unverified = computeApplicationCompleteness(mockProfile, '+2348012345678', null, false);
      expect(unverified.identityUnlocked).toBe(false);
      expect(unverified.phoneUnlocked).toBe(false);
      expect(unverified.idUnlocked).toBe(false);
      expect(unverified.canSubmit).toBe(false);

      const noIdentity = computeApplicationCompleteness(null, null, null, true);
      expect(noIdentity.identityUnlocked).toBe(true);
      expect(noIdentity.phoneUnlocked).toBe(false);
      expect(noIdentity.idUnlocked).toBe(false);

      const unverifiedPhone = computeApplicationCompleteness(mockProfile, null, null, true);
      expect(unverifiedPhone.identityUnlocked).toBe(true);
      expect(unverifiedPhone.phoneUnlocked).toBe(true);
      expect(unverifiedPhone.idUnlocked).toBe(false);

      const readyForId = computeApplicationCompleteness(mockProfile, '+2348012345678', null, true);
      expect(readyForId.identityUnlocked).toBe(true);
      expect(readyForId.phoneUnlocked).toBe(true);
      expect(readyForId.idUnlocked).toBe(true);
      expect(readyForId.submitUnlocked).toBe(false);
    });

    it('provides clear lock reasons for locked steps', () => {
      const noIdentity = computeApplicationCompleteness(null, null, null, true);
      expect(getStepLockReason('identity', noIdentity)).toBeNull();
      expect(getStepLockReason('phone', noIdentity)).toBe('Complete owner identity first.');
      expect(getStepLockReason('id', noIdentity)).toBe('Complete owner identity first.');

      const unverifiedPhone = computeApplicationCompleteness(mockProfile, null, null, true);
      expect(getStepLockReason('phone', unverifiedPhone)).toBeNull();
      expect(getStepLockReason('id', unverifiedPhone)).toBe('Verify your Nigerian phone number first.');
    });
  });

  describe('getDeskPresentation', () => {
    it('presents draft incomplete desk', () => {
      const desk = getDeskPresentation('draft', {
        identityComplete: false,
        phoneComplete: false,
        idUploaded: false,
        canSubmit: false,
        firstIncompleteStep: 'identity',
      });
      expect(desk.eyebrow).toBe('OWNER DESK');
      expect(desk.primaryAction?.label).toBe('Continue application');
      expect(desk.primaryAction?.route).toBe('/(owner)/identity');
    });

    it('presents ready-to-submit draft desk', () => {
      const desk = getDeskPresentation('draft', {
        identityComplete: true,
        phoneComplete: true,
        idUploaded: true,
        canSubmit: true,
        firstIncompleteStep: 'submit',
      });
      expect(desk.eyebrow).toBe('READY TO SUBMIT');
      expect(desk.primaryAction?.label).toBe('Review and submit');
      expect(desk.primaryAction?.route).toBe('/(owner)/submit');
    });

    it('presents submitted desk with disabled submit and honest copy', () => {
      const desk = getDeskPresentation('submitted', {
        identityComplete: true,
        phoneComplete: true,
        idUploaded: true,
        canSubmit: true,
        firstIncompleteStep: 'submit',
      });
      expect(desk.eyebrow).toBe('SUBMITTED');
      expect(desk.primaryAction).toBeNull();
      expect(desk.showChecklist).toBe(false);
    });

    it('presents rejected desk with verbatim reason and update button', () => {
      const desk = getDeskPresentation(
        'rejected',
        {
          identityComplete: true,
          phoneComplete: true,
          idUploaded: true,
          canSubmit: true,
          firstIncompleteStep: 'submit',
        },
        'Passport was expired.',
      );
      expect(desk.eyebrow).toBe('NOT APPROVED');
      expect(desk.body).toBe('Passport was expired.');
      expect(desk.primaryAction?.label).toBe('Update application');
      expect(desk.primaryAction?.route).toBe('/(owner)/identity');
    });

    it('presents approved desk with manage luxury fleet action', () => {
      const desk = getDeskPresentation('approved', {
        identityComplete: true,
        phoneComplete: true,
        idUploaded: true,
        canSubmit: true,
        firstIncompleteStep: null,
      });
      expect(desk.eyebrow).toBe('APPROVED');
      expect(desk.primaryAction?.label).toBe('Manage luxury fleet');
      expect(desk.primaryAction?.route).toBe('/(owner)/fleet');
      expect(desk.showChecklist).toBe(false);
    });
  });

  describe('ownerCommandErrorMessage', () => {
    it('maps HttpsError details.code + details.reason accurately', () => {
      expect(
        ownerCommandErrorMessage({
          details: { code: 'FORBIDDEN', reason: 'phone_unverified' },
        }),
      ).toBe('Verify a Nigerian phone number before continuing.');

      expect(
        ownerCommandErrorMessage({
          details: { code: 'FAILED_PRECONDITION', reason: 'upload_invalid' },
        }),
      ).toBe('The identity document could not be used. Take a clearer photo and try again.');
    });

    it('falls back safely without exposing raw internal error strings', () => {
      expect(
        ownerCommandErrorMessage(new Error('Internal server trace: /var/log/secrets')),
      ).toBe('Something went wrong. Please try again.');
    });
  });
});
