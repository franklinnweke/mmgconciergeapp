import {
  getAuth,
  getIdToken,
  linkWithCredential,
  PhoneAuthProvider,
  reload,
} from '@react-native-firebase/auth';

export type PhoneVerificationSession = {
  verificationId: string;
  phoneE164: string;
};

export { isNigerianE164, normalizeNigerianPhone } from './phone-verification-domain';

export async function requestPhoneVerification(
  phoneE164: string,
): Promise<PhoneVerificationSession> {
  const auth = getAuth();
  if (!auth.currentUser) throw new Error('Sign in before verifying your phone number.');

  const provider = new PhoneAuthProvider(auth);
  // React Native Firebase's native SDK owns iOS app verification. The verifier
  // argument is retained for the current TypeScript overload but is ignored by
  // the native implementation; silent APNs verification is preferred and
  // Firebase falls back to reCAPTCHA only when silent verification is unavailable.
  const verificationId = await provider.verifyPhoneNumber(phoneE164, {
    type: 'recaptcha',
    verify: async () => '',
  });

  return { verificationId, phoneE164 };
}

export async function confirmPhoneVerification(
  session: PhoneVerificationSession,
  code: string,
): Promise<void> {
  const auth = getAuth();
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Sign in before confirming the verification code.');

  const credential = PhoneAuthProvider.credential(session.verificationId, code);
  await linkWithCredential(currentUser, credential);
  await reload(currentUser);
  await getIdToken(currentUser, true);
}
