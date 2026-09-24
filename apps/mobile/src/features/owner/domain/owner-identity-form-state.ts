import type { LagosAreaLabel } from '@mmg/contracts';

export type OwnerIdentityFormState = {
  legalName: string;
  areaLabel: LagosAreaLabel;
  line1: string;
  line2: string;
  termsAccepted: boolean;
  commissionAccepted: boolean;
  privacyAccepted: boolean;
  errorMessage: string | null;
};

export type OwnerIdentityFormAction =
  | { type: 'SET_LEGAL_NAME'; legalName: string }
  | { type: 'SET_AREA_LABEL'; areaLabel: LagosAreaLabel }
  | { type: 'SET_LINE1'; line1: string }
  | { type: 'SET_LINE2'; line2: string }
  | { type: 'TOGGLE_TERMS' }
  | { type: 'TOGGLE_COMMISSION' }
  | { type: 'TOGGLE_PRIVACY' }
  | { type: 'SET_ERROR'; errorMessage: string | null }
  | {
      type: 'HYDRATE_FROM_SEED';
      seed: {
        legalName: string;
        areaLabel: LagosAreaLabel;
        line1: string;
        line2: string;
        termsAccepted: boolean;
        commissionAccepted: boolean;
        privacyAccepted: boolean;
      };
    };

export function ownerIdentityFormReducer(
  state: OwnerIdentityFormState,
  action: OwnerIdentityFormAction,
): OwnerIdentityFormState {
  switch (action.type) {
    case 'SET_LEGAL_NAME':
      return { ...state, legalName: action.legalName, errorMessage: null };
    case 'SET_AREA_LABEL':
      return { ...state, areaLabel: action.areaLabel, errorMessage: null };
    case 'SET_LINE1':
      return { ...state, line1: action.line1, errorMessage: null };
    case 'SET_LINE2':
      return { ...state, line2: action.line2, errorMessage: null };
    case 'TOGGLE_TERMS':
      return { ...state, termsAccepted: !state.termsAccepted, errorMessage: null };
    case 'TOGGLE_COMMISSION':
      return { ...state, commissionAccepted: !state.commissionAccepted, errorMessage: null };
    case 'TOGGLE_PRIVACY':
      return { ...state, privacyAccepted: !state.privacyAccepted, errorMessage: null };
    case 'SET_ERROR':
      return { ...state, errorMessage: action.errorMessage };
    case 'HYDRATE_FROM_SEED':
      return {
        ...state,
        legalName: action.seed.legalName,
        areaLabel: action.seed.areaLabel,
        line1: action.seed.line1,
        line2: action.seed.line2,
        termsAccepted: action.seed.termsAccepted,
        commissionAccepted: action.seed.commissionAccepted,
        privacyAccepted: action.seed.privacyAccepted,
      };
    default:
      return state;
  }
}

export function isOwnerIdentityFormValid(
  state: Pick<
    OwnerIdentityFormState,
    'legalName' | 'line1' | 'termsAccepted' | 'commissionAccepted' | 'privacyAccepted'
  >,
  emailVerified: boolean,
): boolean {
  return (
    emailVerified &&
    state.legalName.trim().length >= 3 &&
    state.legalName.trim().length <= 120 &&
    state.line1.trim().length >= 8 &&
    state.line1.trim().length <= 160 &&
    state.termsAccepted &&
    state.commissionAccepted &&
    state.privacyAccepted
  );
}
