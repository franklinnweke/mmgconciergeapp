import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, inMemoryPersistence, setPersistence } from 'firebase/auth';

import { getClientFirebaseConfig, type ClientFirebaseConfig } from './firebase-client-config';

export { getClientFirebaseConfig, type ClientFirebaseConfig };

export function getClientApp() {
  if (getApps().length > 0) {
    return getApp();
  }
  const firebaseConfig = getClientFirebaseConfig();
  return initializeApp(firebaseConfig);
}

export function getClientAuth() {
  const auth = getAuth(getClientApp());
  void setPersistence(auth, inMemoryPersistence);
  return auth;
}
