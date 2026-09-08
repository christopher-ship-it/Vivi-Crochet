# VIVI Mobile App

Expo (React Native) customer app for VIVI Crochet. Phase 3 delivers the **Learn & Loop → Course → Lesson → Video Player** flow against the live API.

## Requirements

- Node.js 20+
- VIVI API running (default `http://localhost:5080`)
- **Development environment** on the API (for dev customer login)
- Published course + published video uploaded via Admin Dashboard
- Azurite or Azure Storage configured on the API (videos must exist in blob storage)

## Quick start

```powershell
cd mobile
cp .env.example .env   # adjust API URL if needed
npm install
npm start
```

Press `i` for iOS simulator, `a` for Android emulator, or scan the QR code with Expo Go on a physical device.

## Environment variables

| Variable | Example | Notes |
| --- | --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | `http://localhost:5080` | API base URL, no trailing slash |

### API URL by target

| Target | URL |
| --- | --- |
| iOS Simulator | `http://localhost:5080` |
| Android Emulator | `http://10.0.2.2:5080` |
| Physical device | `http://192.168.x.x:5080` (your PC's LAN IP) |

`localhost` on a physical phone points to the phone itself, not your dev machine.

Ensure the API `Cors` settings allow the Expo origin if needed. Mobile apps do not use browser CORS, but the API must be reachable on the network.

## Authentication (development)

The backend currently has **admin email/password** login and a **development-only** customer endpoint:

```http
POST /api/auth/dev/customer-login
{ "phone": "9876543210", "name": "Optional Name" }
```

- Only available when the API runs in **Development** (`ASPNETCORE_ENVIRONMENT=Development`)
- Issues a JWT with `role: Customer`
- Creates/finds a customer record by phone
- **Replaced by phone OTP in a later phase**

The mobile login screen uses this endpoint so stream URLs (`GET /api/videos/{id}/stream-url`) work without admin credentials.

## Video streaming

```text
Lesson screen
  → GET /api/videos/{id}/stream-url  (Bearer JWT)
  ← { streamUrl, expiresAt }         (15-minute read SAS)
  → expo-video streams from Blob URL
```

- No hardcoded blob URLs
- No storage credentials in the app
- On playback failure / expired SAS, tap **Try again** to request a fresh stream URL

## Routes / screens

| Route | Tab / stack | Purpose |
| --- | --- | --- |
| `/login` | Stack | Dev customer sign-in |
| `/(tabs)` | Tabs | Main app |
| `/(tabs)/index` | Home | Hero + featured courses |
| `/(tabs)/learn` | Learn | Course list with category tabs |
| `/(tabs)/shop` | Shop | Placeholder |
| `/(tabs)/live` | Live | Placeholder |
| `/(tabs)/profile` | My VIVI | Account + logout |
| `/course/[id]` | Stack | Course detail + lesson list |
| `/lesson/[id]` | Stack | Video player |

## End-to-end test

1. Admin: create course, upload MP4, publish video + course
2. API: Development + Azure/Azurite blob provider
3. Mobile: `npm start`, sign in with 10-digit phone
4. Learn → open course → tap lesson
5. Video loads and plays (play / pause)

## Run iOS

```powershell
cd mobile
npm run ios
```

Requires Xcode and iOS Simulator (macOS) or Expo Go on iPhone.

## Run Android

```powershell
cd mobile
npm run android
```

Requires Android Studio emulator or Expo Go on Android.

## Production build

```powershell
# .env.production (not committed):
# EXPO_PUBLIC_API_BASE_URL=https://your-api.azurewebsites.net
# EXPO_PUBLIC_ALLOW_HTTP=false

eas build --platform android --profile production
eas build --platform ios --profile production
```

Production builds require HTTPS. Cleartext HTTP is only enabled when `EXPO_PUBLIC_ALLOW_HTTP=true` (local dev). See [AZURE_DEPLOYMENT.md](../AZURE_DEPLOYMENT.md).

## OTA updates (EAS Update)

Small JS / style / asset changes ship over the air — no new store bundle each time.

| Git branch | GitHub Action | EAS channel | Who gets it |
| --- | --- | --- | --- |
| `staging` | `eas-update-staging.yml` | `staging` | Test phone (`preview` APK) |
| `main` | `eas-update-production.yml` | `production` | Customer app (`production` build) |

**Daily flow**

1. Change code under `mobile/`
2. Commit and push to `staging` → test on your phone (or use the in-app **New update available** card → **Update**)
3. Merge to `main` → customers get the same prompt / OTA update

The app checks for EAS Updates on launch and when returning to the foreground, downloads in the background, then shows a small card. **Update** reloads into the new bundle; **Later** dismisses until the next check.

**When you still need a native rebuild**

- Native module / Expo SDK upgrades
- Changing `version` / `runtimeVersion` (policy is `appVersion`)
- Changing native config (permissions, package id, cleartext HTTP, splash plugins, etc.)

### One-time setup

1. Create an Expo access token at [expo.dev/settings/access-tokens](https://expo.dev/settings/access-tokens).
2. Add it as GitHub repo secret `EXPO_TOKEN` on [christopher-ship-it/Vivi-Crochet](https://github.com/christopher-ship-it/Vivi-Crochet/settings/secrets/actions).
3. Create a `staging` branch from `main` if it does not exist yet.
4. Rebuild binaries **once** after Update config is in place (old installs cannot pull OTA):
   - Test: `eas build --platform android --profile preview` → install APK on your phone (`channel: staging`)
   - Customers: `eas build --platform android --profile production` (and iOS when ready) → store submit (`channel: production`)

```text
mobile/
├── app/                 Expo Router screens
├── src/
│   ├── api/             Centralized API client
│   ├── auth/            JWT session (SecureStore)
│   ├── components/      UI building blocks
│   ├── theme/           VIVI colors / fonts
│   ├── types/
│   └── utils/
└── assets/
```

## Not in this phase

Shop, cart, checkout, payments, live classes, OTP, offline downloads, entitlements, notifications.
