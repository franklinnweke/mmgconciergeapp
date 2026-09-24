import { describe, expect, it } from 'vitest';
import {
  CURRENT_COMMISSION_TERMS_VERSION,
  CURRENT_OWNER_TERMS_VERSION,
  CURRENT_PRIVACY_NOTICE_VERSION,
} from '@mmg/contracts';

import {
  isOwnerIdentityFormValid,
  ownerIdentityFormReducer,
  type OwnerIdentityFormState,
} from '../domain/owner-identity-form-state';
import { ownerCommandErrorMessage } from '../domain/owner-errors';

describe('owner-identity-screen production state and error handling', () => {
  const initialValidState: OwnerIdentityFormState = {
    legalName: 'Alhaji Musa Danjuma',
    areaLabel: 'Lekki Phase 1',
    line1: '14 Admiralty Way',
    line2: 'Suite 2',
    termsAccepted: true,
    commissionAccepted: true,
    privacyAccepted: true,
    errorMessage: null,
  };

  it('maps FAILED_PRECONDITION with terms_stale to helpful terms acceptance message', () => {
    const error = {
      details: {
        code: 'FAILED_PRECONDITION',
        reason: 'terms_stale',
      },
    };
    expect(ownerCommandErrorMessage(error)).toBe('Accept the current owner terms to continue.');
  });

  it('sets and clears errorMessage via ownerIdentityFormReducer across all input and agreement actions', () => {
    // 1. Set an error
    let state = ownerIdentityFormReducer(initialValidState, {
      type: 'SET_ERROR',
      errorMessage: 'Accept the current owner terms to continue.',
    });
    expect(state.errorMessage).toBe('Accept the current owner terms to continue.');

    // 2. Modifying legalName clears error
    state = ownerIdentityFormReducer(state, {
      type: 'SET_LEGAL_NAME',
      legalName: 'Alhaji Musa Danjuma Updated',
    });
    expect(state.errorMessage).toBeNull();
    expect(state.legalName).toBe('Alhaji Musa Danjuma Updated');

    // 3. Set error and verify SET_AREA_LABEL clears error
    state = ownerIdentityFormReducer(state, {
      type: 'SET_ERROR',
      errorMessage: 'Some error',
    });
    state = ownerIdentityFormReducer(state, {
      type: 'SET_AREA_LABEL',
      areaLabel: 'Victoria Island',
    });
    expect(state.errorMessage).toBeNull();
    expect(state.areaLabel).toBe('Victoria Island');

    // 4. Set error and verify SET_LINE1 clears error
    state = ownerIdentityFormReducer(state, {
      type: 'SET_ERROR',
      errorMessage: 'Some error',
    });
    state = ownerIdentityFormReducer(state, {
      type: 'SET_LINE1',
      line1: '18 Admiralty Way',
    });
    expect(state.errorMessage).toBeNull();
    expect(state.line1).toBe('18 Admiralty Way');

    // 5. Set error and verify SET_LINE2 clears error
    state = ownerIdentityFormReducer(state, {
      type: 'SET_ERROR',
      errorMessage: 'Some error',
    });
    state = ownerIdentityFormReducer(state, {
      type: 'SET_LINE2',
      line2: 'Suite 4B',
    });
    expect(state.errorMessage).toBeNull();
    expect(state.line2).toBe('Suite 4B');

    // 6. Set error and verify TOGGLE_TERMS clears error
    state = ownerIdentityFormReducer(state, {
      type: 'SET_ERROR',
      errorMessage: 'Some error',
    });
    state = ownerIdentityFormReducer(state, {
      type: 'TOGGLE_TERMS',
    });
    expect(state.errorMessage).toBeNull();
    expect(state.termsAccepted).toBe(false);

    // 7. Set error and verify TOGGLE_COMMISSION clears error
    state = ownerIdentityFormReducer(state, {
      type: 'SET_ERROR',
      errorMessage: 'Some error',
    });
    state = ownerIdentityFormReducer(state, {
      type: 'TOGGLE_COMMISSION',
    });
    expect(state.errorMessage).toBeNull();
    expect(state.commissionAccepted).toBe(false);

    // 8. Set error and verify TOGGLE_PRIVACY clears error
    state = ownerIdentityFormReducer(state, {
      type: 'SET_ERROR',
      errorMessage: 'Some error',
    });
    state = ownerIdentityFormReducer(state, {
      type: 'TOGGLE_PRIVACY',
    });
    expect(state.errorMessage).toBeNull();
    expect(state.privacyAccepted).toBe(false);
  });

  it('hydrates form state from seed without setting error', () => {
    const emptyState: OwnerIdentityFormState = {
      legalName: '',
      areaLabel: 'Ikoyi',
      line1: '',
      line2: '',
      termsAccepted: false,
      commissionAccepted: false,
      privacyAccepted: false,
      errorMessage: 'Old error',
    };

    const hydrated = ownerIdentityFormReducer(emptyState, {
      type: 'HYDRATE_FROM_SEED',
      seed: {
        legalName: 'Hydrated Owner Ltd',
        areaLabel: 'Lekki Phase 1',
        line1: '10 Admiralty Way',
        line2: '',
        termsAccepted: true,
        commissionAccepted: true,
        privacyAccepted: true,
      },
    });

    expect(hydrated.legalName).toBe('Hydrated Owner Ltd');
    expect(hydrated.areaLabel).toBe('Lekki Phase 1');
    expect(hydrated.line1).toBe('10 Admiralty Way');
    expect(hydrated.termsAccepted).toBe(true);
  });

  it('validates isOwnerIdentityFormValid against email verification and field constraints', () => {
    expect(isOwnerIdentityFormValid(initialValidState, true)).toBe(true);
    expect(isOwnerIdentityFormValid(initialValidState, false)).toBe(false);

    // Short legal name (< 3 chars)
    expect(
      isOwnerIdentityFormValid({ ...initialValidState, legalName: 'Al' }, true),
    ).toBe(false);

    // Short line1 (< 8 chars)
    expect(
      isOwnerIdentityFormValid({ ...initialValidState, line1: '1 St' }, true),
    ).toBe(false);

    // Missing terms acceptance
    expect(
      isOwnerIdentityFormValid({ ...initialValidState, termsAccepted: false }, true),
    ).toBe(false);
    expect(
      isOwnerIdentityFormValid({ ...initialValidState, commissionAccepted: false }, true),
    ).toBe(false);
    expect(
      isOwnerIdentityFormValid({ ...initialValidState, privacyAccepted: false }, true),
    ).toBe(false);
  });

  it('validates current contract versions match required constants', () => {
    expect(CURRENT_OWNER_TERMS_VERSION).toBe('owner-terms-2026-09-16');
    expect(CURRENT_COMMISSION_TERMS_VERSION).toBe('owner-commission-2026-09-16');
    expect(CURRENT_PRIVACY_NOTICE_VERSION).toBe('privacy-notice-2026-09-16');
  });
});
