import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.kapt")
    id("com.google.dagger.hilt.android")
}

// ---------------------------------------------------------------------------
// Environment-specific configuration.
//
// Secrets (client ID) are read from `local.properties` (git-ignored) or from
// ~/.gradle/gradle.properties on CI/machines without a local.properties.
// Nothing secret is ever hardcoded here or committed to source control.
// The defaults intentionally mirror the API's `.env` placeholders so the
// AUTH0_AUDIENCE value matches the backend byte-for-byte once configured.
// ---------------------------------------------------------------------------
val localProperties = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) FileInputStream(f).use { load(it) }
}
fun p(name: String, default: String): String =
    localProperties.getProperty(name) ?: (findProperty(name) as String?) ?: default

val auth0Domain: String   = p("auth0Domain", "your-tenant.us.auth0.com")
val auth0ClientId: String = p("auth0ClientId", "TODO_SET_FROM_AUTH0_DASHBOARD")
val auth0Audience: String = p("auth0Audience", "https://api.your-domain.com")
val auth0Namespace: String = p("auth0Namespace", "https://app.your-domain.com")
// "https" = Android App Link callback (Auth0's recommended format; needs the
// signing-cert SHA-256 registered in the Auth0 dashboard). A custom scheme such
// as "com.matmoud.app" works without that step but can be claimed by other apps.
val auth0Scheme: String   = p("auth0Scheme", "https")
val apiBaseUrl: String    = p("apiBaseUrl", "http://10.0.2.2:3000")

android {
    namespace = "com.matmoud.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.matmoud.app"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0-alpha"

        buildConfigField("String", "AUTH0_DOMAIN", "\"$auth0Domain\"")
        buildConfigField("String", "AUTH0_CLIENT_ID", "\"$auth0ClientId\"")
        buildConfigField("String", "AUTH0_AUDIENCE", "\"$auth0Audience\"")
        buildConfigField("String", "AUTH0_NAMESPACE", "\"$auth0Namespace\"")
        buildConfigField("String", "AUTH0_SCHEME", "\"$auth0Scheme\"")
        buildConfigField("String", "API_BASE_URL", "\"$apiBaseUrl\"")

        // Consumed by the Auth0 SDK's RedirectActivity intent filter. Callback URL:
        //   {auth0Scheme}://{auth0Domain}/android/com.matmoud.app/callback
        manifestPlaceholders += mapOf(
            "auth0Domain" to auth0Domain,
            "auth0Scheme" to auth0Scheme,
        )
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.14"
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    // --- Compose (BOM-pinned) ---
    val composeBom = platform("androidx.compose:compose-bom:2024.06.00")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")

    // --- AndroidX / lifecycle / navigation ---
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-compose:1.9.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.1")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.1")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.1")
    implementation("androidx.navigation:navigation-compose:2.7.7")

    // --- Auth0 (Universal Login via Custom Tabs, PKCE, SecureCredentialsManager) ---
    implementation("com.auth0.android:auth0:3.21.0")

    // --- Hilt DI ---
    implementation("com.google.dagger:hilt-android:2.51.1")
    implementation("androidx.hilt:hilt-navigation-compose:1.2.0")
    kapt("com.google.dagger:hilt-compiler:2.51.1")

    // --- Networking ---
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")

    // --- Unit tests (JVM; ./gradlew test still needs the Android SDK installed) ---
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")

    // --- Debug tooling ---
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}

kapt {
    correctErrorTypes = true
}
