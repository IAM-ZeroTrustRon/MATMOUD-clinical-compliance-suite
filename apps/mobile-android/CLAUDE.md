# mobile-android — MAT/MOUD compliance companion

**October 29 contract update:** credential JSON uses `has_document: boolean`;
`document_key`/`documentKey` are no longer client-model fields. The Gson contract
tests cover true/false presence and rejection of raw-key serialization. See
[the hardening report](../../docs/HARDENING-2026-10-29.md) for server changes.
Current validation: 14 JVM tests per debug/release variant passed and the debug
APK built successfully; the dated 12-test results below remain historical.

Native Android client for the MAT/MOUD Clinical Compliance Suite. Phase 2 + 3a
(auth foundation) and a Phase 3b credentials dashboard are implemented. CEU and
camera/document workflows remain pending. See the consolidated
[Gemini handoff](../../docs/GEMINI-HANDOFF.md) for the October 20, 2026 project
snapshot, including chat-only prototype history and separate CEU branch work.
See [the October 20 execution report](../../docs/EXECUTION-STATUS-2026-10-20.md)
for follow-up validation and API/database findings. Local CEU tables already
exist, although the source migration remains on its separate branch.

**Reverified October 20, 2026:** `test` passed with 12 JVM tests in each of the
debug/release variants; `assembleDebug` successfully packaged the debug APK.
The execution report records the artifact hash and remaining security findings.
No device login/upload E2E validation was performed.

This module is its own Gradle root. Open `apps/mobile-android` in Android
Studio, **not** the monorepo root (the rest of the repo is a Node workspace).

Rules of record: `.github/instructions/clinical-compliance-security.instructions.md`
at the repo root wins over anything written here.

## Build & test

Needs JDK 17 and the Android SDK (platform 35, build-tools 35.x), plus a
`local.properties` with a valid `sdk.dir`. `./gradlew test` needs the SDK too —
the tests are plain JVM tests, but AGP still configures the Android project.

Windows gotcha: backslashes in `sdk.dir` are Java-properties escapes. A single
`\` parses into a control character and AGP dies at task-graph time with
"The filename, directory name, or volume label syntax is incorrect". Use
double backslashes or forward slashes:

```properties
sdk.dir=C\:\\tools\\android-sdk          # doubled backslash
# or simply:  sdk.dir=C:/tools/android-sdk
```

```bash
cd apps/mobile-android
./gradlew test           # 12 JVM tests: JWT decode + MFA amr matrix
./gradlew assembleDebug  # app/build/outputs/apk/debug/app-debug.apk
```

Toolchain: Gradle 8.7 (wrapper checksum-pinned), AGP 8.5.2, Kotlin 1.9.24,
compileSdk 35 (required by Auth0.Android 3.x), minSdk 26, targetSdk 34. AGP
8.5.2 is officially tested only through compileSdk 34, so the advisory warning
is silenced with `android.suppressUnsupportedCompileSdk=35` in gradle.properties.

**Verified 2026-09-16 (Windows):** `testDebugUnitTest` = 12/12 pass; `assembleDebug`
produces app-debug.apk. The merged debug manifest contains the Auth0
`RedirectActivity` intent filter (`{auth0Scheme}://{auth0Domain}/android/com.matmoud.app/callback`)
and the debug-only `networkSecurityConfig`.

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
    │   ├── data/api/               MobileAPIClient (raw OkHttp), CredentialsApi + Credential (Retrofit)
    │   ├── di/                     Hilt NetworkModule
    │   ├── ui/                     theme, navigation, screens
    │   └── viewmodel/              AuthViewModel, CredentialsViewModel (session / credentials state)
    ├── debug/                      debug-only cleartext network security config
    └── test/                       JVM tests (JWT + MFA matrix)
```

## State — validated 2026-09-16

The module now **builds and tests clean on Windows**: `./gradlew test` runs the
12 JVM tests (all pass) and `./gradlew assembleDebug` produces the debug APK.
The only pre-existing blocker was environmental, not code: `local.properties`
had single backslashes, which Java properties parse into control characters
(section "Build & test" above documents the fix).

Resolved (was "Known Issues #1–5", all baked into this archive):

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

Added this session — Phase 3b starter:

- **CredentialsScreen (live)**. `CredentialsApi` (Retrofit) + `Credential` model
  against the existing `GET /credentials`; `CredentialsViewModel` fetches with a
  renewed access token and renders the list on the Dashboard route. PHI masking
  stays server-side (Minimum Necessary): a Tier 3 user sees the API's
  `[RESTRICTED]` marker, and the client does not render `ssn`/`dob` at all.
  A failed token refresh flips the app back to the login screen via
  `AuthViewModel.onSessionExpired`.
- Retrofit 2.11.0 + converter-gson added (shares the existing OkHttp client).

Open:

- **CEU track deferred.** The API exposes `/credentials`, `/alerts`, `/audit-logs`
  only — there is no CEU route and no `ceus` table yet (the schema lands on the
  `feat/ceu-tracking-migration` branch; the routes are unwritten). `CEUDetailScreen`
  waits for that backend work.
- Camera/ID capture: use ML Kit **text recognition** for licence scanning when
  this is picked up. An earlier dependency list had ML Kit *face detection*,
  which would collect biometric data nobody asked for.
- `MobileAPIClient` (raw OkHttp) is currently unused by the new credentials flow;
  it stays as the vehicle for the document/presigned-URL endpoints (Phase 4).
- The Auth0 dashboard still needs the real tenant values: callback
  `{auth0Scheme}://{auth0Domain}/android/com.matmoud.app/callback`, an MFA
  Post-Login Action that writes `${auth0Namespace}/amr`, and `local.properties`
  with real `auth0ClientId`/`auth0Domain`/`auth0Audience`/`auth0Namespace`.
- No instrumentation tests yet (they need an emulator); the E2E
  login → MFA → dashboard → upload flow is the next milestone.
