import { describe, expect, it } from 'vitest';
import type { OwnerVisibleProfile } from '@mmg/contracts';

import {
  computeApplicationCompleteness,
  getDeskPresentation,
  isNigerianE164,
  normalizeNigerianPhone,
} from './owner-application.js';
import { ownerCommandErrorMessage } from './owner-errors.js';

describe('owner application domain', () => {
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
      ownerTermsVersion: '2026-04-01-v1',
      commissionTermsVersion: '2026-04-01-v1',
      privacyNoticeVersion: '2026-04-01-v1',
      termsAcceptedAt: '2026-08-15T12:00:00.000Z',
      governmentId: null,
      createdAt: '2026-08-15T12:00:00.000Z',
      updatedAt: '2026-08-15T12:00:00.000Z',
      version: 1,
    };

    it('returns identity incomplete when profile is null', () => {
      const completeness = computeApplicationCompleteness(null, null, null);
      expect(completeness.identityComplete).toBe(false);
      expect(completeness.canSubmit).toBe(false);
      expect(completeness.firstIncompleteStep).toBe('identity');
    });

    it('returns phone incomplete when profile is complete but phone is unverified', () => {
      const completeness = computeApplicationCompleteness(mockProfile, null, null);
      expect(completeness.identityComplete).toBe(true);
      expect(completeness.phoneComplete).toBe(false);
      expect(completeness.firstIncompleteStep).toBe('phone');
    });

    it('returns id incomplete when profile and phone are verified but document is missing', () => {
      const completeness = computeApplicationCompleteness(mockProfile, '+2348012345678', null);
      expect(completeness.identityComplete).toBe(true);
      expect(completeness.phoneComplete).toBe(true);
      expect(completeness.idUploaded).toBe(false);
      expect(completeness.firstIncompleteStep).toBe('id');
    });

    it('returns canSubmit true when all steps are completed', () => {
      const completeness = computeApplicationCompleteness(mockProfile, '+2348012345678', {
        uploadId: 'upload-123',
        documentKind: 'national_id',
        originalFileName: 'nin.jpg',
        contentType: 'image/jpeg',
        byteSize: 1024,
        uploadedAt: '2026-08-15T12:00:00.000Z',
      });
      expect(completeness.canSubmit).toBe(true);
      expect(completeness.firstIncompleteStep).toBe('submit');
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
      expect(desk.primaryAction?.label).toBe('CONTINUE APPLICATION');
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
      expect(desk.primaryAction?.label).toBe('REVIEW AND SUBMIT');
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
      expect(desk.primaryAction?.label).toBe('UPDATE APPLICATION');
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
      expect(desk.primaryAction?.label).toBe('MANAGE LUXURY FLEET');
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
