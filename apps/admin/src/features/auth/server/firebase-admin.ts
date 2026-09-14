import 'server-only';

import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

import { getAdminServerConfig, type AdminServerConfig } from './firebase-admin-config';

export { getAdminServerConfig, type AdminServerConfig };

export function getAdminApp() {
  if (getApps().length > 0) {
    return getApp();
  }
  const config = getAdminServerConfig();
  return initializeApp({
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    ...(config.clientEmail && config.privateKey
      ? {
          credential: cert({
            projectId: config.projectId,
            clientEmail: config.clientEmail,
            privateKey: config.privateKey,
          }),
        }
      : {}),
  });
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminFirestore() {
  return getFirestore(getAdminApp());
}

export function getAdminStorage() {
  return getStorage(getAdminApp());
}
