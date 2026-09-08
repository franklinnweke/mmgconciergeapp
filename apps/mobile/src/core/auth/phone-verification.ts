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

export function isNigerianE164(phone: string | null | undefined): phone is string {
  return Boolean(phone && /^\+234[789]\d{9}$/.test(phone.trim()));
}

export function normalizeNigerianPhone(input: string): string | null {
  const digitsOnly = input.replace(/\D/g, '');
  if (digitsOnly.length === 10 && /^[789]\d{9}$/.test(digitsOnly)) {
    return `+234${digitsOnly}`;
  }
  if (digitsOnly.length === 11 && /^0[789]\d{9}$/.test(digitsOnly)) {
    return `+234${digitsOnly.substring(1)}`;
  }
  if (digitsOnly.length === 13 && /^234[789]\d{9}$/.test(digitsOnly)) {
    return `+${digitsOnly}`;
  }
  return null;
}

export async function requestPhoneVerification(
  phoneE164: string,
): Promise<PhoneVerificationSession> {
  const auth = getAuth();
  if (!auth.currentUser) throw new Error('Sign in before verifying your phone number.');

  const provider = new PhoneAuthProvider(auth);
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
