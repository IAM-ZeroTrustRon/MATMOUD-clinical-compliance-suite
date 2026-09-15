# MAT/MOUD mobile-android — ProGuard/R8 rules.

# Release minification is currently disabled (isMinifyEnabled = false).
# When enabled, keep the auto-generated BuildConfig values referenced by
# reflection-free fields (Auth0/API config reads BuildConfig directly).
-keep class com.matmoud.app.BuildConfig { *; }

# Hilt-generated components must be kept.
-keep,allowobfuscation,allowshrinking class javax.inject.**
-keepclassmembers class * {
    @dagger.* <methods>;
}
