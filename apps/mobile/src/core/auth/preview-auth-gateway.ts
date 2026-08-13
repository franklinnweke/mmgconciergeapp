import { AuthGateway } from '@mmg/contracts';

// Firebase Auth can implement this interface without changing navigation or screens.
export const previewAuthGateway: AuthGateway = {
  async getCurrentSession() {
    return {
      status: 'signedIn',
      user: {
        accountType: 'renter',
        displayName: 'Guest',
        uid: 'preview-renter',
      },
    };
  },
};
