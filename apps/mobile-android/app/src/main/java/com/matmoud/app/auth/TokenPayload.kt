package com.matmoud.app.auth

import org.json.JSONArray
import org.json.JSONObject

/**
 * Decoded ID-token claims that the app actually consumes.
 *
 * NOTE: The app performs STRUCTURAL validation only (format, MFA `amr`
 * presence). Signature, nonce and expiry checks at login are done by the Auth0
 * SDK; authorization decisions are the API's job (jwks-rsa + RS256).
 */
data class TokenPayload(
    val sub: String,
    val iss: String?,
    val aud: String?,
    val iat: Long?,
    val exp: Long?,
    val email: String?,
    val roles: List<String> = emptyList(),
    val tenantId: String? = null,
    val amr: List<String> = emptyList(),
) {
    companion object {
        /**
         * Same accepted set as the backend: apps/api/src/middleware/auth.middleware.ts
         * (`ACCEPTED_MFA_METHODS`). Keep in sync. `pwd`, `otp`, and SMS are NOT here.
         */
        val ACCEPTED_MFA_METHODS: Set<String> = setOf("mfa", "totp", "fido", "fido2")

        fun fromJson(raw: JSONObject, namespace: String): TokenPayload {
            val rolesKey = "$namespace/roles"
            val tenantKey = "$namespace/tenant_id"
            val amrKey = "$namespace/amr"

            val namespacedRoles = raw.optJSONArray(rolesKey)
            val roles = namespacedRoles?.toStringList() ?: raw.optJSONArray("roles")?.toStringList() ?: emptyList()

            val tenantCandidates = listOf(
                raw.optString(tenantKey),
                raw.optString("tenant_id"),
            )
            val tenantId = tenantCandidates.firstOrNull { it.isNotBlank() }

            // Same precedence as the API (`payload[amrKey] ?? payload.amr`): a present,
            // non-null namespaced claim wins even if the root claim would pass, and a
            // non-array value yields [] so the MFA gate fails closed.
            val rawAmr = if (raw.has(amrKey) && !raw.isNull(amrKey)) raw.opt(amrKey) else raw.opt("amr")
            val amr = (rawAmr as? JSONArray)?.toStringList() ?: emptyList()

            return TokenPayload(
                sub = raw.optString("sub").takeIf { it.isNotBlank() } ?: "",
                iss = raw.optString("iss").takeIf { it.isNotBlank() },
                aud = raw.optString("aud").takeIf { it.isNotBlank() },
                iat = if (raw.has("iat")) raw.getLong("iat") else null,
                exp = if (raw.has("exp")) raw.getLong("exp") else null,
                email = raw.optString("email").takeIf { it.isNotBlank() },
                roles = roles,
                tenantId = tenantId,
                amr = amr,
            )
        }
    }
}

internal fun JSONArray.toStringList(): List<String> {
    val result = ArrayList<String>(length())
    for (i in 0 until length()) {
        val value = opt(i)
        if (value != null && value != JSONObject.NULL) {
            result.add(value.toString())
        }
    }
    return result
}
