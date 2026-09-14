import 'server-only';

export type AdminServerConfig = {
  projectId: string;
  storageBucket: string;
  environment: 'development' | 'production';
  clientEmail?: string;
  privateKey?: string;
};

export function getAdminServerConfig(): AdminServerConfig {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  if (!projectId) {
    throw new Error(
      'Missing required server environment variable: FIREBASE_PROJECT_ID. ' +
      'Server configuration must not fall back to NEXT_PUBLIC_* variables or default projects.'
    );
  }

  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET?.trim();
  if (!storageBucket) {
    throw new Error(
      'Missing required server environment variable: FIREBASE_STORAGE_BUCKET. ' +
      'Server configuration must not fall back to NEXT_PUBLIC_* variables or default buckets.'
    );
  }

  const rawEnv = process.env.MMG_FIREBASE_ENV?.trim() || 'development';
  if (rawEnv !== 'development' && rawEnv !== 'production') {
    throw new Error(
      `Invalid server MMG_FIREBASE_ENV: expected "development" or "production", got "${rawEnv}".`
    );
  }

  const publicEnv = process.env.NEXT_PUBLIC_MMG_FIREBASE_ENV?.trim();
  if (publicEnv && publicEnv !== rawEnv) {
    throw new Error(
      `Firebase environment mismatch: server MMG_FIREBASE_ENV is "${rawEnv}" ` +
      `but client NEXT_PUBLIC_MMG_FIREBASE_ENV is "${publicEnv}".`
    );
  }

  const publicProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  if (publicProjectId && publicProjectId !== projectId) {
    throw new Error(
      `Firebase project ID mismatch: server FIREBASE_PROJECT_ID is "${projectId}" ` +
      `but client NEXT_PUBLIC_FIREBASE_PROJECT_ID is "${publicProjectId}".`
    );
  }

  if (rawEnv === 'development') {
    if (projectId !== 'mmg-concierge-dev') {
      throw new Error(
        `Invalid server Firebase project ID for development environment: expected "mmg-concierge-dev", got "${projectId}".`
      );
    }
    if (storageBucket !== 'mmg-concierge-dev.firebasestorage.app') {
      throw new Error(
        `Invalid server Firebase storage bucket for development environment: expected "mmg-concierge-dev.firebasestorage.app", got "${storageBucket}".`
      );
    }
  } else {
    if (projectId !== 'mmg-concierge') {
      throw new Error(
        `Invalid server Firebase project ID for production environment: expected "mmg-concierge", got "${projectId}".`
      );
    }
    if (storageBucket !== 'mmg-concierge.firebasestorage.app') {
      throw new Error(
        `Invalid server Firebase storage bucket for production environment: expected "mmg-concierge.firebasestorage.app", got "${storageBucket}".`
      );
    }
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim() || undefined;
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY?.trim() || undefined;
  const privateKey = rawPrivateKey ? rawPrivateKey.replace(/\\n/g, '\n') : undefined;

  if ((clientEmail && !privateKey) || (!clientEmail && privateKey)) {
    throw new Error(
      'Both FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be provided together when configuring service-account credentials via environment variables.'
    );
  }

  return {
    projectId,
    storageBucket,
    environment: rawEnv,
    ...(clientEmail && privateKey ? { clientEmail, privateKey } : {}),
  };
}
