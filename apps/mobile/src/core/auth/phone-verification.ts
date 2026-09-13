import {
  getAuth,
  getIdToken,
  linkWithCredential,
  PhoneAuthProvider,
  reload,
  verifyPhoneNumber,
} from '@react-native-firebase/auth';

export type PhoneVerificationSession = {
  authUid: string;
  verificationId: string;
  phoneE164: string;
};

export { isNigerianE164, normalizeNigerianPhone } from './phone-verification-domain';

export async function requestPhoneVerification(
  phoneE164: string,
): Promise<PhoneVerificationSession> {
  const auth = getAuth();
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Sign in before verifying your phone number.');
  const authUid = currentUser.uid;

  return new Promise<PhoneVerificationSession>((resolve, reject) => {
    let settled = false;
    const listener = verifyPhoneNumber(auth, phoneE164);

    listener.on(
      'state_changed',
      (snapshot) => {
        if (settled) return;
        if (snapshot.error) {
          settled = true;
          reject(snapshot.error);
          return;
        }
        if (snapshot.verificationId) {
          settled = true;
          resolve({
            authUid,
            verificationId: snapshot.verificationId,
            phoneE164,
          });
        }
      },
      (error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      },
    );
  });
}

export async function confirmPhoneVerification(
  session: PhoneVerificationSession,
  code: string,
): Promise<void> {
  const auth = getAuth();
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Sign in before confirming the verification code.');
  if (currentUser.uid !== session.authUid) {
    throw new Error('Your account changed. Request a new verification code before continuing.');
  }

  const credential = PhoneAuthProvider.credential(session.verificationId, code);
  await linkWithCredential(currentUser, credential);
  await reload(currentUser);
  await getIdToken(currentUser, true);
}
