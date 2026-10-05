# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
# Start Expo dev server
npm start

# Run on Android (requires emulator or connected device)
npm run android

# Run on iOS (requires macOS + Xcode)
npm run ios

# TypeScript check (no emit)
npx tsc --noEmit

# Run all tests
npm test

# Run tests sequentially (required when tests share module state)
npm test -- --runInBand

# Run a single test file
npm test -- path/to/__tests__/file.test.ts
```

Tests live in `__tests__/` subfolders throughout `lib/` and `components/`. The Jest config (`jest.config.js`) matches only `**/__tests__/**/*.test.ts` — test files must follow this naming convention. `@/` path alias resolves to the repo root (matches `tsconfig.json`).

Before treating a change as done, run `npx tsc --noEmit` and `npm test -- --runInBand`. Run `npx expo-doctor` when dependencies or native config change. Do not commit, push, or run `eas build` or `eas submit` unless asked. Production Android `versionCode` comes from EAS `autoIncrement` with `appVersionSource: remote`.

## Environment Variables

Create a `.env` file (gitignored) with:

```
EXPO_PUBLIC_API_BASE_URL=   # CircuSave backend base URL
EXPO_PUBLIC_APP_ENV=        # "development" | "production"
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
```

All runtime config flows through `lib/shared/config.ts`. The app is a thin client. Business rules live on the backend. The app collects input, calls the API, and renders the result.

## Product rules

Package id is `com.circusave.mobile`. URL scheme is `circusavemobile`.

- Pass the auth token into each API call. There is no global token.
- Put user-facing copy in `lib/i18n/locales/{en,es,ht}/` and add every new key to all three locales.
- The backend owns membership, ledger totals, contribution confirmation, and premium. A screen focus or back navigation reloads data and must not create, reverse, or duplicate a payment.
- Circle contributions are manual: the member marks a payment sent, and the organizer confirms it. `buildContributionPaymentRails` in `lib/payments/contributionPaymentRails.ts` always leaves `showStripeRail` false. Leave `@stripe/stripe-react-native`, `StripeProvider`, and in-app contribution charges out of the app. `lib/payments/stripeContributionPayment.ts` is lock and status presentation only.
- Organizer Pro on Android is Google Play Billing through `expo-iap` and `lib/billing/googlePlayBillingMachine.ts`. Premium follows the backend entitlement response.

## Architecture

### Routing (Expo Router v6, file-system)

`app/_layout.tsx` is the root. It sets up:

1. Font and i18n initialization. Render stays blank until both are ready.
2. Provider tree: `ThemeProvider` → `AuthSessionProvider` → `EntitlementsProvider` → `MarketProvider` → `DeviceLockProvider`
3. `LaunchSplashController` hides the splash screen only after auth status and device lock are both resolved
4. `UnauthenticatedRouteGuard` watches pathname and auth status, and resets to login on sign-out
5. `SessionExpiryController` listens for 401 events from the API layer and triggers global sign-out
6. `NotificationNavigationController` intercepts push notification taps and navigates to the target circle workspace

`DeviceLockProvider` locks the foreground until biometric or password unlock. Protected navigation waits while the lock is initializing or locked.

Route groups:

- `app/(tabs)/` — bottom-tab shell (dashboard, circles, create-circle, activity, settings). Requires authentication.
- `app/circle/` — full-screen stack screens pushed over the tab shell (workspace, assistant, invite, payment-setup, agreement-review, history, reminder-schedule)
- `app/legal/`, `app/payment/`, `app/create-circle/` — other stack screens

### Auth (`lib/auth/`)

`AuthSessionProvider` / `useAuthSession` manages session state with these statuses: `loading | authenticated | unauthenticated | error`. Session transitions are serialized through a promise queue (`enqueueAuthTransition`) to prevent races. On login, it registers a push token. On logout, it unregisters. `lib/auth/authBoundary.ts` contains the navigation decision functions (`shouldIssueSignedOutReset`, `resetNavigationToLogin`, and others) used by `_layout.tsx`.

Google sign-in uses `react-native-nitro-google-signin`. Apple sign-in uses `expo-apple-authentication`. Nonces use `expo-crypto`. Those native modules need a dev client or store binary. They do not run in Expo Go. Do not add `google-services.json`.

### Entitlements (`lib/billing/`)

`EntitlementsProvider` / `useEntitlements` tracks subscription state. On Android it owns a `GooglePlayBillingMachine`. On iOS and web it polls the backend. Entitlements refresh on login and on every app foreground event. `getFreshContributionPaymentsCapability` re-reads `contributionPaymentsEnabled` from the backend and aborts after 5 seconds.

### API Layer (`lib/api.ts`)

Single file at the `lib/` root with the backend calls. Keep new calls there. Auth token is passed explicitly to each call. Errors are typed as `ApiError` (from `lib/platform/networkErrors.ts`) with a `category` field (`offline | timeout | http_401 | http_4xx | http_5xx | http_429 | cancelled`). The layer includes:

- `runWithTimeout` wraps every fetch with an abort timeout
- `runDedupedGet` / `shouldUseHttpGetCache` cache GET responses and deduplicate in-flight requests
- `notifyUnauthorizedSession` emits a 401 event that `SessionExpiryController` handles globally

### Where code lives

`lib/` is grouped by responsibility:

- `auth/`, `billing/`, `circles/`, `payments/`, `platform/`, `shared/`
- `assistant/`, `contracts/`, `domain/`, `i18n/`, `selectors/`, and `testing/` stay in those folders

`android/` and `ios/` are gitignored native projects produced by prebuild. Do not commit them.

### i18n (`lib/i18n/`)

i18next with three locales: `en`, `es`, and `ht` (Haitian Creole). Translation namespaces mirror feature areas (`navigation`, `dashboard`, `circles`, `subscription`, and the other JSON files under each locale). `lib/i18n/formatters.ts` handles currency and date presentation. Initialize via `initializeI18n()`, called once in `_layout.tsx`.

### Domain Model (`lib/domain/`)

Pure TypeScript types and value helpers with no React dependencies. Safe to import in tests without mocking. Key files: `money.ts`, `statuses.ts`, `hand.ts`, `membership.ts`, `ids.ts`.

### Shared UI primitives

- `lib/shared/theme.ts` is the source for `colors`, `radii`, `spacing`, and `shadows`. Import from here.
- `lib/shared/types.ts` holds shared response shapes from the API (`BackendCircleSummary`, `DashboardSummary`, `ActivityResponse`).

### Testing pattern

Tests use `ts-jest` in a Node environment. There is no React Native renderer. Mocks for `expo-crypto` and `react-native-nitro-google-signin` are registered in `jest.config.js`. Additional shared mocks live in `lib/testing/`. Tests cover `lib/` and `components/` logic. Screens are not tested directly.
