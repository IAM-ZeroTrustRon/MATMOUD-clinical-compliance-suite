package com.matmoud.app.data.api

import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException

/**
 * Minimal HTTP client for the MAT/MOUD backend. Phase 4 adds typed
 * credential/CEU endpoints; the auth plumbing (Bearer injection and the
 * emulator-safe base URL) is settled here so later work is additive.
 */
class MobileAPIClient(
    private val okHttpClient: OkHttpClient,
    baseUrl: String,
) {
    private val base = baseUrl.trimEnd('/')

    fun get(path: String, accessToken: String): String {
        val response = okHttpClient.newCall(
            Request.Builder()
                .url("$base$path")
                .header("Authorization", "Bearer $accessToken")
                .get()
                .build(),
        ).execute()

        response.use {
            if (!it.isSuccessful) {
                throw IOException("API ${it.code}: ${it.body?.string() ?: ""}".trim())
            }
            return it.body?.string() ?: ""
        }
    }
}
