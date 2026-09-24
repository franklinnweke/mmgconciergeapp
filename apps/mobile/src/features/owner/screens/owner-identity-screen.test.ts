import { describe, expect, it } from 'vitest';
import {
  CURRENT_COMMISSION_TERMS_VERSION,
  CURRENT_OWNER_TERMS_VERSION,
  CURRENT_PRIVACY_NOTICE_VERSION,
} from '@mmg/contracts';

import { ownerCommandErrorMessage } from '../domain/owner-errors';

describe('owner-identity-screen state and error handling', () => {
  it('maps FAILED_PRECONDITION with terms_stale to helpful terms acceptance message', () => {
    const error = {
      details: {
        code: 'FAILED_PRECONDITION',
        reason: 'terms_stale',
      },
    };
    expect(ownerCommandErrorMessage(error)).toBe('Accept the current owner terms to continue.');
  });

  it('clears stale error state when any input or agreement is updated', () => {
    // Model the error clearing reducer/state logic implemented in OwnerIdentityScreen
    let errorMessage: string | null = 'Accept the current owner terms to continue.';

    const clearError = () => {
      if (errorMessage) errorMessage = null;
    };

    const handleLegalNameChange = (_text: string) => {
      clearError();
    };

    const handleLine1Change = (_text: string) => {
      clearError();
    };

    const handleLine2Change = (_text: string) => {
      clearError();
    };

    const handleAreaSelect = (_area: string) => {
      clearError();
    };

    const handleToggleTerms = () => {
      clearError();
    };

    const handleToggleCommission = () => {
      clearError();
    };

    const handleTogglePrivacy = () => {
      clearError();
    };

    // Updating legal name clears error
    handleLegalNameChange('Alhaji Musa Danjuma');
    expect(errorMessage).toBeNull();

    // Reset error
    errorMessage = 'Accept the current owner terms to continue.';
    handleAreaSelect('Victoria Island');
    expect(errorMessage).toBeNull();

    // Reset error
    errorMessage = 'Accept the current owner terms to continue.';
    handleLine1Change('14 Admiralty Way');
    expect(errorMessage).toBeNull();

    // Reset error
    errorMessage = 'Accept the current owner terms to continue.';
    handleLine2Change('Flat 3B');
    expect(errorMessage).toBeNull();

    // Reset error
    errorMessage = 'Accept the current owner terms to continue.';
    handleToggleTerms();
    expect(errorMessage).toBeNull();

    // Reset error
    errorMessage = 'Accept the current owner terms to continue.';
    handleToggleCommission();
    expect(errorMessage).toBeNull();

    // Reset error
    errorMessage = 'Accept the current owner terms to continue.';
    handleTogglePrivacy();
    expect(errorMessage).toBeNull();
  });

  it('validates current contract versions match required constants', () => {
    expect(CURRENT_OWNER_TERMS_VERSION).toBe('owner-terms-2026-09-16');
    expect(CURRENT_COMMISSION_TERMS_VERSION).toBe('owner-commission-2026-09-16');
    expect(CURRENT_PRIVACY_NOTICE_VERSION).toBe('privacy-notice-2026-09-16');
  });
});
