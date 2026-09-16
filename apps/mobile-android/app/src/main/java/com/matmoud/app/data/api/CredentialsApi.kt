package com.matmoud.app.data.api

import retrofit2.http.GET
import retrofit2.http.Header

/**
 * Credential endpoints on the MAT/MOUD backend.
 *
 * `GET /credentials` returns the full per-tenant list (already audit-logged and
 * tier-masked by the API). Tokens come from [com.matmoud.app.auth.Auth0Client.getAccessToken],
 * which transparently renews them via [com.auth0.android.authentication.storage.SecureCredentialsManager].
 */
interface CredentialsApi {

    @GET("credentials")
    suspend fun getCredentials(
        @Header("Authorization") authorization: String,
    ): List<Credential>
}
