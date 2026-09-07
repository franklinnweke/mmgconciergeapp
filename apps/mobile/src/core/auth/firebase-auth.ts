import {
  AppleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  getIdToken,
  GoogleAuthProvider,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from '@react-native-firebase/auth';
import {
  GoogleSignin,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import {
  emailAddressSchema,
  emailPasswordRegistrationSchema,
  emailPasswordSignInSchema,
  type EmailPasswordRegistration,
  type EmailPasswordSignIn,
} from '@mmg/contracts';
import Constants from 'expo-constants';

import { readGoogleWebClientId } from './google-sign-in-config';

const GOOGLE_WEB_CLIENT_ID = readGoogleWebClientId(Constants.expoConfig?.extra);

GoogleSignin.configure({
  webClientId: GOOGLE_WEB_CLIENT_ID,
});

const auth = getAuth();

export type GoogleSignInResult = 'signed-in' | 'cancelled';
export type GoogleProviderSignInResult =
  | { status: 'signed-in'; user: User }
  | { status: 'cancelled' };

export type AppleSignInResult = 'signed-in' | 'cancelled';
export type AppleProviderSignInResult =
  | { status: 'signed-in'; user: User }
  | { status: 'cancelled' };

export function subscribeToAuthState(listener: (user: User | null) => void) {
  return onAuthStateChanged(auth, listener);
}

export async function registerWithEmailPassword(input: EmailPasswordRegistration) {
  const credentials = emailPasswordRegistrationSchema.parse(input);
  const result = await createUserWithEmailAndPassword(
    auth,
    credentials.email,
    credentials.password,
  );

  await updateProfile(result.user, { displayName: credentials.displayName });
  await sendEmailVerification(result.user);
  return result.user;
}

export async function signInWithEmailPassword(input: EmailPasswordSignIn) {
  const credentials = emailPasswordSignInSchema.parse(input);
  await signInWithEmailAndPassword(auth, credentials.email, credentials.password);
}

export async function signInWithGoogle(): Promise<GoogleProviderSignInResult> {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();

  if (!isSuccessResponse(response)) {
    return { status: 'cancelled' };
  }

  if (!response.data.idToken) {
    throw new Error('Google did not return an identity token. Please try again.');
  }

  const credential = GoogleAuthProvider.credential(response.data.idToken);
  const result = await signInWithCredential(auth, credential);
  return { status: 'signed-in', user: result.user };
}

export async function signInWithApple(): Promise<AppleProviderSignInResult> {
  const isAvailable = await AppleAuthentication.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Apple Sign-In is not available on this device.');
  }

  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  let appleCredential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    appleCredential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (caught: unknown) {
    if (
      caught
      && typeof caught === 'object'
      && 'code' in caught
      && caught.code === 'ERR_REQUEST_CANCELED'
    ) {
      return { status: 'cancelled' };
    }
    throw caught;
  }

  if (!appleCredential.identityToken) {
    throw new Error('Apple did not return an identity token. Please try again.');
  }

  const credential = AppleAuthProvider.credential(appleCredential.identityToken, rawNonce);
  const result = await signInWithCredential(auth, credential);

  const fullName = [
    appleCredential.fullName?.givenName,
    appleCredential.fullName?.familyName,
  ].filter(Boolean).join(' ').trim();

  if (fullName && !result.user.displayName) {
    await updateProfile(result.user, { displayName: fullName });
  }

  return { status: 'signed-in', user: result.user };
}

export async function requestPasswordReset(email: string) {
  const normalizedEmail = emailAddressSchema.parse(email);
  await sendPasswordResetEmail(auth, normalizedEmail);
}

export async function resendVerificationEmail() {
  if (!auth.currentUser) {
    throw new Error('Sign in again before requesting a verification email.');
  }

  await sendEmailVerification(auth.currentUser);
}

export async function refreshCurrentUser(): Promise<User | null> {
  if (!auth.currentUser) {
    return null;
  }

  await reload(auth.currentUser);
  await getIdToken(auth.currentUser, true);
  return auth.currentUser;
}

export async function signOutCurrentUser() {
  await Promise.allSettled([GoogleSignin.signOut(), signOut(auth)]);
}

export function getFriendlyAuthError(error: unknown): string {
  if (error && typeof error === 'object' && 'issues' in error) {
    const issue = (error as { issues?: { message?: string }[] }).issues?.[0];
    if (issue?.message) return issue.message;
  }

  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';

  const messages: Record<string, string> = {
    'auth/email-already-in-use': 'An account already uses this email address.',
    'auth/invalid-credential': 'The email or password is incorrect.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/network-request-failed': 'Check your connection and try again.',
    'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
    'auth/user-disabled': 'This account is unavailable. Contact MMG Concierge.',
    'auth/user-not-found': 'The email or password is incorrect.',
    'auth/weak-password': 'Use a stronger password with at least 8 characters.',
    'auth/wrong-password': 'The email or password is incorrect.',
    'auth/invalid-verification-code': 'That code is incorrect. Try again.',
    'auth/invalid-phone-number': 'Enter a valid Nigerian mobile number.',
    'auth/credential-already-in-use': 'That phone number is already used by another account.',
    'auth/account-exists-with-different-credential':
      'An account already exists with this email using another sign-in method.',
    'auth/apple-sign-in-failed': 'Apple sign-in could not be completed. Try again.',
    'storage/unauthorized': 'The document could not be stored. Try again.',
  };

  if (messages[code]) return messages[code];
  return 'Something went wrong. Please try again.';
}

export type { User };
