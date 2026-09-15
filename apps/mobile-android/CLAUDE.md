# mobile-android — MAT/MOUD compliance companion

Native Android client for the MAT/MOUD Clinical Compliance Suite. Phase 2 + 3a
(auth foundation) only; credential and CEU screens are Phase 4.

This module is its own Gradle root. Open `apps/mobile-android` in Android
Studio, **not** the monorepo root (the rest of the repo is a Node workspace).

Rules of record: `.github/instructions/clinical-compliance-security.instructions.md`
at the repo root wins over anything written here.

## Build & test

Needs JDK 17 and the Android SDK (platform 35, build-tools 35.x), plus a
`local.properties` with a valid `sdk.dir`. `./gradlew test` needs the SDK too —
the tests are plain JVM tests, but AGP still configures the Android project.

```bash
cd apps/mobile-android
./gradlew test           # 13 JVM tests: JWT decode + MFA amr matrix
./gradlew assembleDebug  # app/build/outputs/apk/debug/app-debug.apk
```

Toolchain: Gradle 8.7 (wrapper checksum-pinned), AGP 8.5.2, Kotlin 1.9.24,
compileSdk 35 (required by Auth0.Android 3.x), minSdk 26, targetSdk 34.

## Configuration

Nothing secret is committed. `app/build.gradle.kts` reads these from
`local.properties` (git-ignored) or `~/.gradle/gradle.properties`:

```properties
sdk.dir=C\:\\Users\\you\\AppData\\Local\\Android\\Sdk
auth0Domain=your-tenant.us.auth0.com
auth0ClientId=YOUR_CLIENT_ID
auth0Audience=https://api.your-domain.com     # must equal the API's AUTH0_AUDIENCE
auth0Namespace=https://app.your-domain.com    # must equal the API's AUTH0_NAMESPACE
auth0Scheme=https                             # or a custom scheme, see below
apiBaseUrl=http://10.0.2.2:3000               # emulator alias for the host's localhost
```

`auth0Audience` and `auth0Namespace` must match the API's `.env` exactly, or
every request 401s and the MFA claim is never found.

### Auth0 dashboard

Callback URL — register as **both** an Allowed Callback URL and an Allowed
Logout URL:

```
{auth0Scheme}://{auth0Domain}/android/com.matmoud.app/callback
```

With `auth0Scheme=https` this is an Android App Link, which requires the app's
signing-certificate SHA-256 fingerprint in the dashboard (Applications →
Settings → Device Settings → Android). Each debug keystore has its own
fingerprint (`keytool -list -v -keystore ~/.android/debug.keystore -alias
androiddebugkey -storepass android`). Setting `auth0Scheme=com.matmoud.app`
skips that step but uses a custom scheme, which another app can also claim.

An Auth0 Action must emit the `amr` claim (and `roles`/`tenant_id`) under
`auth0Namespace`; the API reads the namespaced claim first.

## Security design

**MFA gate.** `JWTDecoder.validateMFA` accepts exactly the API's
`ACCEPTED_MFA_METHODS`: `mfa`, `totp`, `fido`, `fido2`. `pwd`, `otp`, SMS and a
missing claim are rejected, fail-closed. `TokenPayload.fromJson` reads
`{namespace}/amr` first and falls back to root `amr` only when the namespaced
claim is absent or null — same precedence as `payload[amrKey] ?? payload.amr` in
`auth.middleware.ts`, including treating a non-array value as empty. Credentials
that fail the gate are never saved. This is a UX-level check: the app does not
verify JWT signatures, and the API re-enforces MFA on every request.

**The SDK owns the OAuth protocol.** Auth0.Android 3.21.0 handles PKCE, `state`,
`nonce`, ID-token signature validation, the Chrome Custom Tabs launch (RFC 8252,
never a WebView) and the redirect through its own `RedirectActivity`. There is no
hand-written OAuth code and no callback intent filter in our manifest.

**Token storage.** `SecureCredentialsManager` encrypts credentials with an
Android Keystore key (hardware-backed where the device has a TEE) and renews
them with the refresh token. The deprecated `androidx.security-crypto` is not
used. The MFA gate is not re-run after a silent renewal: Auth0 does not reliably
re-emit `amr` on refreshed ID tokens, and the API checks the access token anyway.

**Cleartext HTTP.** Permitted only for `10.0.2.2` and only in the debug source
set (`app/src/debug/`). Release builds keep Android's default cleartext block.

**No PHI in logs.** There is no OkHttp logging interceptor. Do not add one at
`BODY` level: it would write tokens and PHI to logcat.

## Layout

```
apps/mobile-android/
├── build.gradle.kts, settings.gradle.kts, gradle.properties, gradlew, gradle/wrapper
└── app/src/
    ├── main/java/com/matmoud/app/
    │   ├── MatMoudApplication.kt   @HiltAndroidApp
    │   ├── MainActivity.kt         single activity, Compose host
    │   ├── auth/                   Auth0Config, Auth0Client, JWTDecoder, TokenPayload, Auth0Exception
    │   ├── data/api/               MobileAPIClient (Bearer injection)
    │   ├── di/                     Hilt NetworkModule
    │   ├── ui/                     theme, navigation, screens
    │   └── viewmodel/              AuthViewModel (isAuthenticated / isLoading / errorMessage)
    ├── debug/                      debug-only cleartext network security config
    └── test/                       JVM tests (JWT + MFA matrix)
```

## State — 2026-09-15

Nothing here has been compiled or run. There is no JDK, Gradle or Android SDK on
the Windows machine this was written on, and `local.properties` points `sdk.dir`
at a path that does not exist. First run in Android Studio will need a Gradle
sync, and compile errors are likely on first pass.

Resolved this session (was "Known Issues #1–5"):

1. Hand-built PKCE/state/nonce/token-exchange replaced by the Auth0 SDK.
   `PKCEGenerator`, `TokenSet`, `ISecureTokenStorage`, `KeystoreTokenStorage` and
   `CustomTabsLauncher` are gone.
2. `amr` lookup now matches the API's namespaced-first precedence, with tests.
3. Callback moved to Auth0's standard `/android/{applicationId}/callback` format;
   the `auth.matmoud.app` domain link is gone.
4. Token storage is `SecureCredentialsManager`.
5. Debug cleartext narrowed from all hosts to `10.0.2.2`.

Also fixed: missing Gradle wrapper (added 8.7, checksum-verified), AGP 8.3.2 →
8.5.2 for compileSdk 35, an unresolved `SecretKey` reference in the old Keystore
storage, and a test that called `isUrlSafe` as if it were a String extension —
either would have failed the build before a single test ran.

Open:

- Build and test have never run. Do that first.
- Phase 4 endpoints: the API exposes `/credentials`, `/alerts`, `/audit-logs`.
  There is no CEU route yet — the `ceus` table lands in the
  `feat/ceu-tracking-migration` branch, the routes are unwritten.
- Camera work should use ML Kit **text recognition** for licence scanning.
  An earlier dependency list had ML Kit *face detection*, which would collect
  biometric data nobody asked for.
- Phase 1 of the root `TODO.md` (seed, credentials, audit-log endpoints) is still
  unverified; wiring the app to a live API before that mixes up the failures.
