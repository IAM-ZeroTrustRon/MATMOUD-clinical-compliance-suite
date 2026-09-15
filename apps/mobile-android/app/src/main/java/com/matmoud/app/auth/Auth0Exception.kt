package com.matmoud.app.auth

/**
 * Typed exception hierarchy so ViewModels can pattern-match instead of parsing
 * string messages. Auth0 SDK errors are mapped onto these in [Auth0Client], so
 * nothing outside that class depends on SDK exception types.
 */
sealed class Auth0Exception(
    message: String,
    cause: Throwable? = null,
) : Exception(message, cause) {

    /** The user closed the Custom Tabs login without finishing. */
    class AuthorizationCancelledException(
        message: String = "Authorization cancelled by user",
    ) : Auth0Exception(message)

    /** Universal Login returned an error, or no browser was available. */
    class AuthorizationFailedException(
        message: String,
        cause: Throwable? = null,
    ) : Auth0Exception(message, cause)

    /** ID token failed structural/claim validation. */
    class TokenValidationException(
        message: String,
    ) : Auth0Exception(message)

    /**
     * MFA enforcement: the `amr` claim lacks any accepted method. Fail-closed,
     * per clinical-compliance-security.instructions.md and in parity with
     * ACCEPTED_MFA_METHODS in apps/api/src/middleware/auth.middleware.ts.
     */
    class MFARequiredException(
        message: String = "MFA verification required. SMS is not an accepted method.",
    ) : Auth0Exception(message)

    /** No usable session (logged out, or expired and could not be refreshed). */
    class InvalidStateException(
        message: String,
        cause: Throwable? = null,
    ) : Auth0Exception(message, cause)

    /** Low-level network failure. */
    class NetworkException(
        message: String,
        cause: Throwable? = null,
    ) : Auth0Exception(message, cause)

    /** Credentials could not be encrypted/stored on the device. */
    class SecureStorageException(
        message: String,
        cause: Throwable? = null,
    ) : Auth0Exception(message, cause)
}
