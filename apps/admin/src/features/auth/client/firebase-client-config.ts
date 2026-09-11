export type ClientFirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  environment: 'development' | 'production';
};

export function getClientFirebaseConfig(): ClientFirebaseConfig {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  if (!apiKey || apiKey === 'mock-api-key') {
    throw new Error(
      'Missing or invalid required client environment variable: NEXT_PUBLIC_FIREBASE_API_KEY.'
    );
  }

  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();
  if (!authDomain) {
    throw new Error(
      'Missing required client environment variable: NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN.'
    );
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  if (!projectId) {
    throw new Error(
      'Missing required client environment variable: NEXT_PUBLIC_FIREBASE_PROJECT_ID.'
    );
  }

  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();
  if (!storageBucket) {
    throw new Error(
      'Missing required client environment variable: NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET.'
    );
  }

  const rawEnv = process.env.NEXT_PUBLIC_MMG_FIREBASE_ENV?.trim() || 'development';
  if (rawEnv !== 'development' && rawEnv !== 'production') {
    throw new Error(
      `Invalid client NEXT_PUBLIC_MMG_FIREBASE_ENV: expected "development" or "production", got "${rawEnv}".`
    );
  }

  if (rawEnv === 'development') {
    if (projectId !== 'mmg-concierge-dev') {
      throw new Error(
        `Invalid client Firebase project ID for development environment: expected "mmg-concierge-dev", got "${projectId}".`
      );
    }
    if (authDomain !== 'mmg-concierge-dev.firebaseapp.com') {
      throw new Error(
        `Invalid client Firebase auth domain for development environment: expected "mmg-concierge-dev.firebaseapp.com", got "${authDomain}".`
      );
    }
    if (storageBucket !== 'mmg-concierge-dev.firebasestorage.app') {
      throw new Error(
        `Invalid client Firebase storage bucket for development environment: expected "mmg-concierge-dev.firebasestorage.app", got "${storageBucket}".`
      );
    }
  } else {
    if (projectId !== 'mmg-concierge') {
      throw new Error(
        `Invalid client Firebase project ID for production environment: expected "mmg-concierge", got "${projectId}".`
      );
    }
    if (authDomain !== 'mmg-concierge.firebaseapp.com') {
      throw new Error(
        `Invalid client Firebase auth domain for production environment: expected "mmg-concierge.firebaseapp.com", got "${authDomain}".`
      );
    }
    if (storageBucket !== 'mmg-concierge.firebasestorage.app') {
      throw new Error(
        `Invalid client Firebase storage bucket for production environment: expected "mmg-concierge.firebasestorage.app", got "${storageBucket}".`
      );
    }
  }

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    environment: rawEnv,
  };
}
