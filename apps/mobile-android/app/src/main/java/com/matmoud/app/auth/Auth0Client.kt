package com.matmoud.app.auth

import android.content.Context
import com.auth0.android.Auth0
import com.auth0.android.authentication.AuthenticationAPIClient
import com.auth0.android.authentication.AuthenticationException
import com.auth0.android.authentication.storage.CredentialsManagerException
import com.auth0.android.authentication.storage.SecureCredentialsManager
import com.auth0.android.provider.WebAuthProvider
import com.auth0.android.result.Credentials

/**
 * Thin wrapper over the Auth0.Android SDK.
 *
 * The SDK owns the OAuth protocol: Authorization Code + PKCE, `state` and
 * `nonce` checks, ID-token signature validation, the Chrome Custom Tabs launch
 * (RFC 8252 — never a WebView) and the redirect via its RedirectActivity.
 * [SecureCredentialsManager] stores the tokens encrypted with an Android
 * Keystore key and refreshes them when they expire.
 *
 * What stays here is this app's policy: the MFA `amr` gate at login, mapping
 * SDK errors onto [Auth0Exception], and revoking the refresh token on logout.
 */
class Auth0Client(
    private val config: Auth0Config,
    private val account: Auth0,
    private val credentialsManager: SecureCredentialsManager,
) {

    /**
     * Runs Universal Login in Custom Tabs. [context] must be an Activity.
     * Credentials are saved only if the ID token shows an accepted MFA method.
     */
    suspend fun login(context: Context): Credentials {
        val credentials = try {
            WebAuthProvider.login(account)
                .withScheme(config.scheme)
                .withAudience(config.audience)
                .withScope(SCOPE)
                .await(context)
        } catch (e: AuthenticationException) {
            throw e.toAuth0Exception()
        }

        // MFA gate — display/UX level; the API re-enforces it on every request.
        // A session that fails the gate is never persisted.
        JWTDecoder.validateMFA(JWTDecoder.decode(credentials.idToken, config.namespace))

        try {
            credentialsManager.saveCredentials(credentials)
        } catch (e: CredentialsManagerException) {
            throw Auth0Exception.SecureStorageException("Could not store credentials securely", e)
        }
        return credentials
    }

    /**
     * Returns a usable access token. The SDK renews it with the stored refresh
     * token when it has expired. The MFA gate is not re-run on renewal: Auth0
     * does not reliably re-emit `amr` on refreshed ID tokens, and the API checks
     * MFA on the access token itself.
     */
    suspend fun getAccessToken(): String = try {
        credentialsManager.awaitCredentials().accessToken
    } catch (e: CredentialsManagerException) {
        throw Auth0Exception.InvalidStateException("No usable session", e)
    }

    fun isAuthenticated(): Boolean = credentialsManager.hasValidCredentials()

    /**
     * Clears local credentials first, then best-effort revokes the refresh
     * token and ends the Auth0 browser session (so the next login prompts
     * again). [context] must be an Activity.
     */
    suspend fun logout(context: Context) {
        val refreshToken = try {
            credentialsManager.awaitCredentials().refreshToken
        } catch (e: CredentialsManagerException) {
            null
        }
        credentialsManager.clearCredentials()

        if (refreshToken != null) {
            try {
                AuthenticationAPIClient(account).revokeToken(refreshToken).await()
            } catch (e: AuthenticationException) {
                // Already logged out locally; an unrevoked token still expires server-side.
            }
        }
        try {
            WebAuthProvider.logout(account).withScheme(config.scheme).await(context)
        } catch (e: AuthenticationException) {
            // User closed the tab or no browser — local session is already gone.
        }
    }

    private fun AuthenticationException.toAuth0Exception(): Auth0Exception = when {
        isCanceled -> Auth0Exception.AuthorizationCancelledException()
        isNetworkError -> Auth0Exception.NetworkException("Network error contacting Auth0", this)
        isBrowserAppNotAvailable ->
            Auth0Exception.AuthorizationFailedException("No browser is available to sign in", this)
        else -> Auth0Exception.AuthorizationFailedException("Sign-in failed: ${getDescription()}", this)
    }

    companion object {
        private const val SCOPE = "openid profile email offline_access"
    }
}
