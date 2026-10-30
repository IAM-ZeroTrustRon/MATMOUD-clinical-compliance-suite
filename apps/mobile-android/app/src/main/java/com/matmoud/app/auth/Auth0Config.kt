package com.matmoud.app.auth

import com.matmoud.app.BuildConfig

/**
 * Auth0 / API configuration surfaced through BuildConfig.
 *
 * Values are injected at build time from gradle properties (`local.properties`
 * or `~/.gradle/gradle.properties`) — see app/build.gradle.kts. Real
 * credentials are therefore never committed to source control.
 */
data class Auth0Config(
    val domain: String = BuildConfig.AUTH0_DOMAIN,
    val clientId: String = BuildConfig.AUTH0_CLIENT_ID,
    val audience: String = BuildConfig.AUTH0_AUDIENCE,
    val namespace: String = BuildConfig.AUTH0_NAMESPACE,
    val apiBaseUrl: String = BuildConfig.API_BASE_URL,
    /** Callback scheme; must match the `auth0Scheme` manifest placeholder. */
    val scheme: String = BuildConfig.AUTH0_SCHEME,
)
