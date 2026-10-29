package com.matmoud.app.auth

import com.google.gson.Gson
import com.matmoud.app.data.api.Credential
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CredentialContractTest {
    @Test
    fun documentPresenceUsesBooleanWithoutSerializingStorageKeys() {
        val gson = Gson()
        val credential = gson.fromJson(
            """{"id":"synthetic-id","has_document":true,"document_key":"synthetic-ignored-key"}""",
            Credential::class.java,
        )
        assertTrue(credential.hasDocument)
        assertFalse(gson.toJson(credential).contains("document_key"))
    }

    @Test
    fun noDocumentFlagIsFalse() {
        val credential = Gson().fromJson(
            """{"id":"synthetic-id","has_document":false}""",
            Credential::class.java,
        )
        assertFalse(credential.hasDocument)
    }
}
