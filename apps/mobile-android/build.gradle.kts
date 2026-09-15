// Top-level build file — plugins are declared here with `apply false` and
// applied in the app module. Versions are pinned (no dynamic ranges).
// AGP 8.5.2 is required for compileSdk 35 (Auth0.Android 3.x) and needs Gradle 8.7+.
plugins {
    id("com.android.application") version "8.5.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.24" apply false
    id("org.jetbrains.kotlin.kapt") version "1.9.24" apply false
    id("com.google.dagger.hilt.android") version "2.51.1" apply false
}
