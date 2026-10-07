import type { RenterCompletionGateway } from './renter-completion-gateway-core';
export type { RenterCompletionGateway } from './renter-completion-gateway-core';

export function createRenterCompletionGateway(): RenterCompletionGateway {
  return {
    async confirmCompletion() {
      throw new Error('Trip completion is unavailable in this web preview. Use the native app.');
    },
  };
}
