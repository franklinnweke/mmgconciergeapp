import {
  CompleteRenterProfileData,
  RenterProfileRecord,
  RequestAccountDeletionData,
} from '@mmg/contracts';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/core/auth/auth-context';
import { safeProviderError } from '@/core/errors/safe-provider-error';
import { createRenterProfileGateway } from '../data/renter-profile-gateway';

export function useRenterProfile() {
  const { signingOut, user } = useAuth();
  const [profileState, setProfileState] = useState<{
    profile: RenterProfileRecord | null;
    isLoading: boolean;
    errorMessage: string | null;
  }>({
    profile: null,
    isLoading: true,
    errorMessage: null,
  });

  const [isSaving, setIsSaving] = useState(false);
  const gateway = useMemo(() => createRenterProfileGateway(), []);

  const loadProfile = useCallback(async () => {
    if (!user?.uid) {
      setProfileState({ profile: null, isLoading: false, errorMessage: null });
      return;
    }

    try {
      const res = await gateway.getRenterProfile(user.uid);
      setProfileState({ profile: res, isLoading: false, errorMessage: null });
    } catch (err) {
      setProfileState((prev) => ({
        ...prev,
        isLoading: false,
        errorMessage: safeProviderError(err, 'Failed to load profile.'),
      }));
    }
  }, [gateway, user]);

  useEffect(() => {
    let isMounted = true;
    if (!user?.uid || signingOut) {
      setProfileState({ profile: null, isLoading: false, errorMessage: null });
      return;
    }

    gateway
      .getRenterProfile(user.uid)
      .then((res) => {
        if (isMounted && !signingOut) {
          setProfileState({ profile: res, isLoading: false, errorMessage: null });
        }
      })
      .catch((err) => {
        if (isMounted && !signingOut) {
          setProfileState({
            profile: null,
            isLoading: false,
            errorMessage: safeProviderError(err, 'Failed to load profile.'),
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [gateway, signingOut, user]);

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

  return {
    profile: profileState.profile,
    isLoading: profileState.isLoading,
    isSaving,
    errorMessage: profileState.errorMessage,
    refresh: loadProfile,
    saveProfile,
    requestDeletion,
  };
}
