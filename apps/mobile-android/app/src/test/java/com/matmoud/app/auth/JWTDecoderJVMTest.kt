package com.matmoud.app.auth

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.util.Base64

/**
 * JWT decoding + MFA `amr` enforcement, in parity with
 * apps/api/src/middleware/auth.middleware.ts — both the accepted method set
 * and the `payload[namespace/amr] ?? payload.amr` lookup order.
 */
class JWTDecoderJVMTest {

    private val namespace = "https://app.your-domain.com"

    // ---------------------------------------------------------------- helpers

    private fun jwt(claims: JSONObject): String {
        val header = base64Url(JSONObject().apply {
            put("alg", "RS256")
            put("typ", "JWT")
        }.toString())
        val payload = base64Url(claims.toString())
        return "$header.$payload.unsigned-signature"
    }

    /** [namespacedAmr] may be a JSONArray, JSONObject.NULL, or a non-array value. */
    private fun claims(
        amr: List<String>? = null,
        namespacedAmr: Any? = null,
        tenantId: String? = null,
        roles: List<String>? = null,
    ): JSONObject = JSONObject().apply {
        put("sub", "auth0|12345")
        put("iss", "https://test.auth0.com/")
        put("aud", "https://api.your-domain.com")
        put("iat", nowSeconds())
        put("exp", nowSeconds() + 3600)
        if (amr != null) put("amr", JSONArray(amr))
        if (namespacedAmr != null) put("$namespace/amr", namespacedAmr)
        if (tenantId != null) put("$namespace/tenant_id", tenantId)
        if (roles != null) put("$namespace/roles", JSONArray(roles))
    }

    /** Decode + run the MFA gate, the way Auth0Client does on login. */
    private fun gate(claims: JSONObject) =
        JWTDecoder.validateMFA(JWTDecoder.decode(jwt(claims), namespace))

    // ---------------------------------------------------------------- MFA matrix (root amr)

    @Test
    fun acceptsMfaAndTotp() {
        gate(claims(amr = listOf("mfa", "totp"))) // must not throw
    }

    @Test(expected = Auth0Exception.MFARequiredException::class)
    fun rejectsPasswordOnly() {
        gate(claims(amr = listOf("pwd")))
    }

    @Test(expected = Auth0Exception.MFARequiredException::class)
    fun rejectsSmsAndAmbiguousOtp() {
        gate(claims(amr = listOf("otp", "sms")))
    }

    @Test(expected = Auth0Exception.MFARequiredException::class)
    fun rejectsMissingAmrFailClosed() {
        gate(claims(amr = null))
    }

    @Test
    fun acceptsFidoAndFido2() {
        gate(claims(amr = listOf("fido2")))
        gate(claims(amr = listOf("fido")))
    }

    // ---------------------------------------------------------------- namespaced amr (API parity)

    @Test
    fun acceptsNamespacedAmrWhenRootAmrIsAbsent() {
        gate(claims(namespacedAmr = JSONArray(listOf("mfa"))))
    }

    @Test(expected = Auth0Exception.MFARequiredException::class)
    fun namespacedAmrTakesPrecedenceOverRootAmr() {
        // API: payload[amrKey] ?? payload.amr — the root "mfa" is never consulted.
        gate(claims(amr = listOf("mfa"), namespacedAmr = JSONArray(listOf("pwd"))))
    }

    @Test
    fun fallsBackToRootAmrWhenNamespacedAmrIsNull() {
        gate(claims(amr = listOf("totp"), namespacedAmr = JSONObject.NULL))
    }

    @Test(expected = Auth0Exception.MFARequiredException::class)
    fun rejectsNonArrayNamespacedAmrFailClosed() {
        gate(claims(amr = listOf("mfa"), namespacedAmr = "mfa"))
    }

    // ---------------------------------------------------------------- claims

    @Test
    fun parsesNamespacedTenantAndRolesClaims() {
        val payload = JWTDecoder.decode(
            jwt(claims(
                amr = listOf("fido2"),
                tenantId = "acme-clinic",
                roles = listOf("clinician"),
            )),
            namespace,
        )
        assertEquals("acme-clinic", payload.tenantId)
        assertEquals(listOf("clinician"), payload.roles)
        assertEquals("auth0|12345", payload.sub)
    }

    @Test
    fun decodesOptionalClaimsToNull() {
        val payload = JWTDecoder.decode(jwt(claims(amr = listOf("totp"))), namespace)
        assertNull(payload.email)
    }

    @Test(expected = Auth0Exception.TokenValidationException::class)
    fun rejectsMalformedJwtStructure() {
        JWTDecoder.decode("not-a-jwt", namespace)
    }

    private fun nowSeconds(): Long = System.currentTimeMillis() / 1000L

    private fun base64Url(raw: String): String =
        Base64.getUrlEncoder().withoutPadding().encodeToString(raw.toByteArray(Charsets.UTF_8))
}
