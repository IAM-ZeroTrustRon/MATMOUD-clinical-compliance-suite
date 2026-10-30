package com.matmoud.app.data.api

import com.google.gson.annotations.SerializedName

/**
 * A provider credential row returned by `GET /credentials`.
 *
 * PHI fields (`ssn`, `dob`, `license_number`, `provider_name`) are already
 * masked server-side for Tier 3 users (the API replaces the value with the
 * literal `[RESTRICTED]` — see apps/api/src/middleware/rbac.ts maskPhiFields).
 * The client therefore performs no masking of its own and displays exactly what
 * the server returns: the API is the authority for the Minimum Necessary rule.
 */
data class Credential(
    @SerializedName("id") val id: String,
    @SerializedName("provider_name") val providerName: String? = null,
    @SerializedName("dob") val dob: String? = null,
    @SerializedName("ssn") val ssn: String? = null,
    @SerializedName("license_number") val licenseNumber: String? = null,
    @SerializedName("expiration_date") val expirationDate: String? = null,
    @SerializedName("has_document") val hasDocument: Boolean = false,
    @SerializedName("created_at") val createdAt: String? = null,
) {
    /** True when the server already replaced a PHI field with the redaction marker. */
    val isRedacted: Boolean
        get() = providerName == RESTRICTED || ssn == RESTRICTED ||
            dob == RESTRICTED || licenseNumber == RESTRICTED

    companion object {
        const val RESTRICTED = "[RESTRICTED]"
    }
}
