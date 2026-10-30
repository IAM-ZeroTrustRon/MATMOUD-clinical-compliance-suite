package com.matmoud.app.auth

import org.json.JSONObject
import java.util.Base64

/**
 * ID-token decoder with structural + MFA compliance validation.
 *
 * SCOPE (documented so nobody over-trusts this): signature, nonce and expiry
 * are validated by the Auth0 SDK at login, and the backend API is authoritative
 * for all authorization decisions (jwks-rsa / RS256 in auth.middleware.ts).
 * This class performs:
 *   1. Format validation (three dot-separated, base64url segments)
 *   2. Claim extraction (incl. namespaced tenant_id/roles/amr)
 *   3. MFA `amr` enforcement — fail-closed, parity with the API's
 *      `ACCEPTED_MFA_METHODS = {mfa, totp, fido, fido2}` (pwd/otp/sms excluded)
 */
object JWTDecoder {

    private val JWT_PATTERN = Regex("^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$")

    /**
     * Must remain in parity with `ACCEPTED_MFA_METHODS` in
     * apps/api/src/middleware/auth.middleware.ts. Deliberately excludes
     * 'pwd' and 'otp' (see that file's comments — audit finding MOUD-01).
     */
    val ACCEPTED_MFA_METHODS: Set<String> = TokenPayload.ACCEPTED_MFA_METHODS

    fun decode(token: String, namespace: String): TokenPayload {
        if (!JWT_PATTERN.matches(token)) {
            throw Auth0Exception.TokenValidationException("Malformed JWT: expected header.payload.signature, base64url")
        }

        val parts = token.split(".")

        // Header decoded structurally only — verifies base64url + JSON shape.
        decodeSegmentToObject(parts[0], "header")

        val payload = try {
            decodeSegmentToObject(parts[1], "payload")
        } catch (e: Auth0Exception.TokenValidationException) {
            throw e
        } catch (e: Exception) {
            throw Auth0Exception.TokenValidationException("Payload could not be parsed: ${e.message}")
        }

        return TokenPayload.fromJson(payload, namespace)
    }

    /**
     * Fail-closed MFA gate. Throws [Auth0Exception.MFARequiredException] unless
     * at least one `amr` method is in the accepted set. The app treats this as a
     * UX/display check; the API re-enforces it authoritatively.
     */
    fun validateMFA(payload: TokenPayload) {
        if (payload.amr.none { it in ACCEPTED_MFA_METHODS }) {
            throw Auth0Exception.MFARequiredException(
                "MFA verification required. Accepted methods: ${ACCEPTED_MFA_METHODS.joinToString()}. SMS is not accepted.",
            )
        }
    }

    private fun decodeSegmentToObject(segment: String, name: String): JSONObject {
        val decoded = try {
            String(Base64.getUrlDecoder().decode(segment), Charsets.UTF_8)
        } catch (e: IllegalArgumentException) {
            throw Auth0Exception.TokenValidationException("$name is not valid base64url")
        }
        return try {
            JSONObject(decoded)
        } catch (e: Exception) {
            throw Auth0Exception.TokenValidationException("$name is not a valid JSON object")
        }
    }
}
