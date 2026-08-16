import type { OwnerVisibleProfile } from '@mmg/contracts';

import { PREVIEW_OWNER_PROFILE } from './preview-owner-verification';

export type OwnerVerificationRepository = {
  subscribe(
    ownerId: string,
    onUpdate: (profile: OwnerVisibleProfile | null) => void,
    onError: (error: Error) => void,
  ): () => void;
};

export function createOwnerVerificationRepository(): OwnerVerificationRepository {
  return {
    subscribe(_ownerId, onUpdate) {
      // Deterministic web fixture subscription
      onUpdate(PREVIEW_OWNER_PROFILE);
      return () => {};
    },
  };
}
