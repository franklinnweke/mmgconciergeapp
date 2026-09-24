import {
  CompleteRenterProfileData,
  RenterProfileRecord,
  RequestAccountDeletionData,
} from '@mmg/contracts';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../../../core/auth/auth-context';
import { safeProviderError } from '../../../core/errors/safe-provider-error';
import {
  createRenterProfileGateway,
  type RenterProfileGateway,
} from '../data/renter-profile-gateway';
import {
  RenterProfileError,
  type RenterProfileDiagnosticCode,
} from '../data/renter-profile-record';

export type RenterProfileState = {
  profile: RenterProfileRecord | null;
  isLoading: boolean;
  errorMessage: string | null;
  diagnosticCode: RenterProfileDiagnosticCode | null;
};

type LoadedProfileState = {
  renterId: string | null;
  profile: RenterProfileRecord | null;
  isLoading: boolean;
  errorMessage: string | null;
  diagnosticCode: RenterProfileDiagnosticCode | null;
};

export function useRenterProfile(customGateway?: RenterProfileGateway) {
  const { signingOut, user } = useAuth();
  const currentUid = user?.uid ?? null;

  const [profileState, setProfileState] = useState<LoadedProfileState>(() => ({
    renterId: currentUid,
    profile: null,
    isLoading: Boolean(currentUid && !signingOut),
    errorMessage: null,
    diagnosticCode: null,
  }));

  const [isSaving, setIsSaving] = useState(false);
  const gateway = useMemo(() => customGateway ?? createRenterProfileGateway(), [customGateway]);

  const loadProfile = useCallback(async () => {
    if (!currentUid) {
      setProfileState({
        renterId: null,
        profile: null,
        isLoading: false,
        errorMessage: null,
        diagnosticCode: null,
      });
      return;
    }

    try {
      const res = await gateway.getRenterProfile(currentUid);
      setProfileState({
        renterId: currentUid,
        profile: res,
        isLoading: false,
        errorMessage: null,
        diagnosticCode: null,
      });
    } catch (err) {
      const diagnosticCode =
        err instanceof RenterProfileError ? err.diagnosticCode : 'profile_read_failed';
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('[useRenterProfile] Failed to load renter profile:', {
          diagnosticCode,
          error: err,
        });
      }
      setProfileState({
        renterId: currentUid,
        profile: null,
        isLoading: false,
        errorMessage: safeProviderError(err, 'Failed to load profile.'),
        diagnosticCode,
      });
    }
  }, [currentUid, gateway]);

  useEffect(() => {
    let isMounted = true;
    if (!currentUid || signingOut) {
      return;
    }

    gateway
      .getRenterProfile(currentUid)
      .then((res) => {
        if (isMounted && !signingOut) {
          setProfileState({
            renterId: currentUid,
            profile: res,
            isLoading: false,
            errorMessage: null,
            diagnosticCode: null,
          });
        }
      })
      .catch((err) => {
        if (isMounted && !signingOut) {
          const diagnosticCode =
            err instanceof RenterProfileError ? err.diagnosticCode : 'profile_read_failed';
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.warn('[useRenterProfile] Failed to load renter profile on mount:', {
              diagnosticCode,
              error: err,
            });
          }
          setProfileState({
            renterId: currentUid,
            profile: null,
            isLoading: false,
            errorMessage: safeProviderError(err, 'Failed to load profile.'),
            diagnosticCode,
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [currentUid, gateway, signingOut]);

  const saveProfile = async (data: CompleteRenterProfileData) => {
    setIsSaving(true);
    try {
      const res = await gateway.completeProfile(data);
      if (res.result) {
        await loadProfile();
      }
      return res;
    } catch (err) {
      const msg = safeProviderError(err, 'Failed to save renter profile.');
      setProfileState((prev) => ({ ...prev, errorMessage: msg }));
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const requestDeletion = async (data: RequestAccountDeletionData) => {
    setIsSaving(true);
    try {
      const res = await gateway.requestDeletion(data);
      if (res.result) {
        await loadProfile();
      }
      return res;
    } catch (err) {
      const msg = safeProviderError(err, 'Failed to request account deletion.');
      setProfileState((prev) => ({ ...prev, errorMessage: msg }));
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const isAnonymousOrSigningOut = !currentUid || signingOut;
  const isMatchesActiveUser = profileState.renterId === currentUid;

  const visibleProfile =
    isAnonymousOrSigningOut || !isMatchesActiveUser ? null : profileState.profile;
  const visibleLoading = isAnonymousOrSigningOut
    ? false
    : !isMatchesActiveUser
      ? true
      : profileState.isLoading;
  const visibleErrorMessage =
    isAnonymousOrSigningOut || !isMatchesActiveUser ? null : profileState.errorMessage;
  const visibleDiagnosticCode =
    isAnonymousOrSigningOut || !isMatchesActiveUser ? null : profileState.diagnosticCode;

  return {
    profile: visibleProfile,
    isLoading: visibleLoading,
    isSaving,
    errorMessage: visibleErrorMessage,
    diagnosticCode: visibleDiagnosticCode,
    refresh: loadProfile,
    saveProfile,
    requestDeletion,
  };
}
