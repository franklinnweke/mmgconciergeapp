import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function readPlistString(plist, key) {
  const match = plist.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`));
  if (!match?.[1]) throw new Error(`Missing ${key} in Firebase iOS configuration.`);
  return match[1];
}

export function updateGoogleUrlSchemes(infoPlist, firebasePlist) {
  const reversedClientId = readPlistString(firebasePlist, 'REVERSED_CLIENT_ID');
  const googleAppId = readPlistString(firebasePlist, 'GOOGLE_APP_ID');
  const appIdScheme = `app-${googleAppId.replaceAll(':', '-')}`;

  const withClientScheme = infoPlist.replace(
    /com\.googleusercontent\.apps\.[^<]+/,
    reversedClientId,
  );
  const withAppIdScheme = withClientScheme.replace(/app-1-[^<]+/, appIdScheme);

  if (withAppIdScheme === infoPlist) {
    throw new Error('Native iOS Google URL schemes were not updated.');
  }
  return withAppIdScheme;
}

export function selectFirebaseConfig(environment = process.env.MMG_FIREBASE_ENV) {
  const selectedEnvironment = environment === 'production' ? 'production' : 'development';
  const iosSource = resolve(
    mobileRoot,
    selectedEnvironment === 'production'
      ? 'GoogleService-Info.plist'
      : 'GoogleService-Info.dev.plist',
  );
  const androidSource = resolve(
    mobileRoot,
    selectedEnvironment === 'production'
      ? 'google-services.json'
      : 'google-services.dev.json',
  );
  const iosDestination = resolve(mobileRoot, 'ios/MMGConcierge/GoogleService-Info.plist');
  const androidDestination = resolve(mobileRoot, 'android/app/google-services.json');
  const infoPlistPath = resolve(mobileRoot, 'ios/MMGConcierge/Info.plist');
  const firebasePlist = readFileSync(iosSource, 'utf8');

  copyFileSync(iosSource, iosDestination);
  copyFileSync(androidSource, androidDestination);
  writeFileSync(
    infoPlistPath,
    updateGoogleUrlSchemes(readFileSync(infoPlistPath, 'utf8'), firebasePlist),
  );

  process.stdout.write(`Selected ${selectedEnvironment} Firebase native configuration.\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  selectFirebaseConfig();
}
