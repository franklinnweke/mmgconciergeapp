# MMG Concierge

Firebase-backed React Native marketplace for chauffeured luxury rentals in Lagos.

## Current implementation

The repository now contains the completed Phase 1 experience foundation plus
parallel Firebase authentication groundwork:

- Expo Router mobile app with custom development builds
- Premium, image-led renter discovery home with mobile navigation, branded
  typography, tactile press states, and restrained motion
- Shared brand, contract, and domain packages in an npm workspace
- Replaceable discovery and authentication boundaries with deterministic web data
- React Native Firebase Authentication and Cloud Firestore native SDKs
- Email/password registration and sign-in
- Google Sign-In through Firebase Authentication
- Email verification and password reset
- Apple and Android Firebase app registrations using `com.mmgconcierge.app`
- Standard/Native Firestore in `africa-south1`
- Deny-by-default Firestore Rules and negative Emulator Suite tests
- Shared Zod authentication contracts and MMG brand tokens

The next UI milestone is Phase 2: browse/search, vehicle details, date and quote
selection, checkout handoff states, trips, and renter profile surfaces.

`mmg-concierge` is treated as the current development project. The architecture requires physically separate staging and production Firebase projects before launch.

## Prerequisites

- Node.js 22+
- Xcode 26.2+ for local iOS builds
- Android Studio for local Android builds
- Java 21+ for Firebase emulators
- Firebase CLI login with access to `mmg-concierge`

React Native Firebase uses native code. **Expo Go is not supported.** Use an EAS or local development build.

## Install and check

```bash
npm install
npm run typecheck
npm test
npm run lint
npm run test:rules
```

`npm run test:rules` requires the Firebase Emulator Suite and Java. The ordinary
`npm test` command skips those emulator-only cases when the emulator is absent.

## Run a development build

Generate ignored native projects and run locally:

```bash
cd apps/mobile
npx expo prebuild --clean
npx expo run:ios
# or: npx expo run:android
```

For EAS:

```bash
npx eas-cli build --profile development-simulator --platform ios
npx eas-cli build --profile development --platform android
```

## Firebase configuration

Version-controlled Firebase configuration lives in `firebase/`. Deploy from the repository root:

```bash
npm run firebase:deploy:auth
npm run firebase:deploy:firestore
```

Email/password and Google providers are enabled. Anonymous authentication is disabled. The initial Firestore rules deny every client operation until a versioned collection schema, query contract, and rules test are implemented.

Firebase mobile configuration files contain client identifiers and Firebase API keys intended to ship in apps. They are not server secrets. Paystack keys, Admin SDK credentials, and service credentials must never be committed.

The implementation source of truth is [`docs/architecture/MMG_CONCIERGE_TECHNICAL_ARCHITECTURE_AND_IMPLEMENTATION_HANDOFF.md`](docs/architecture/MMG_CONCIERGE_TECHNICAL_ARCHITECTURE_AND_IMPLEMENTATION_HANDOFF.md).
