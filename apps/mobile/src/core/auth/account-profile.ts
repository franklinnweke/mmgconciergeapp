import {
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from '@react-native-firebase/firestore';
import {
  accountProfileSchema,
  type AccountProfile,
  type AccountType,
} from '@mmg/contracts';

import type { User } from './firebase-auth';
import { decodeAccountProfile } from './account-profile-domain';

const database = getFirestore();

export async function loadAccountProfile(uid: string): Promise<AccountProfile | null> {
  const snapshot = await getDoc(doc(database, 'users', uid));
  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  return decodeAccountProfile({
    uid: data.uid,
    accountType: data.accountType,
    displayName: data.displayName,
    email: data.email,
  }, uid);
}

export async function createAccountProfile(
  user: User,
  accountType: AccountType,
): Promise<AccountProfile> {
  const fallbackName = user.email?.split('@')[0] ?? 'MMG Member';
  const profile = accountProfileSchema.parse({
    uid: user.uid,
    accountType,
    displayName: user.displayName?.trim() || fallbackName,
    email: user.email,
  });

  await setDoc(doc(database, 'users', user.uid), {
    ...profile,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return profile;
}
