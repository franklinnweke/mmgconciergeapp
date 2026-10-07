import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import { createCompletionGateway } from './renter-completion-gateway-core';

export type { RenterCompletionGateway } from './renter-completion-gateway-core';

export function createRenterCompletionGateway() {
  return createCompletionGateway(async (command) => {
    const response = await httpsCallable(getFunctions(undefined, 'africa-south1'), 'confirmBookingCompletion')(command);
    return response.data;
  });
}
