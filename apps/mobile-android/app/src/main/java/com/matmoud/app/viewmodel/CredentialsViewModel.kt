package com.matmoud.app.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.matmoud.app.auth.Auth0Client
import com.matmoud.app.auth.Auth0Exception
import com.matmoud.app.data.api.Credential
import com.matmoud.app.data.api.CredentialsApi
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class CredentialsUiState(
    val isLoading: Boolean = false,
    val credentials: List<Credential> = emptyList(),
    val errorMessage: String? = null,
    /** Token could not be refreshed — the session is over and login is required again. */
    val sessionExpired: Boolean = false,
)

/**
 * Fetches and exposes the tenant's credential list from `GET /credentials`.
 *
 * - Uses [Auth0Client.getAccessToken] so a stale access token is renewed from
 *   the stored refresh token before the request is sent.
 * - A [Auth0Exception.InvalidStateException] (no usable session / refresh
 *   failed) is surfaced as [CredentialsUiState.sessionExpired] instead of a
 *   transient error so the UI can flip back to the login screen.
 * - PHI masking is the API's job (Minimum Necessary); this screen renders the
 *   response verbatim.
 */
@HiltViewModel
class CredentialsViewModel @Inject constructor(
    private val credentialsApi: CredentialsApi,
    private val auth0Client: Auth0Client,
) : ViewModel() {

    private val _uiState = MutableStateFlow(CredentialsUiState())
    val uiState: StateFlow<CredentialsUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            try {
                val accessToken = auth0Client.getAccessToken()
                val credentials = credentialsApi.getCredentials("Bearer $accessToken")
                _uiState.update { it.copy(isLoading = false, credentials = credentials) }
            } catch (e: Auth0Exception.InvalidStateException) {
                _uiState.update { it.copy(isLoading = false, sessionExpired = true) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, errorMessage = e.message) }
            }
        }
    }
}
