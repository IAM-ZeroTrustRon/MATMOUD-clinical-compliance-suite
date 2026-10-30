package com.matmoud.app.viewmodel

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.matmoud.app.auth.Auth0Client
import com.matmoud.app.auth.Auth0Exception
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AuthUiState(
    val isAuthenticated: Boolean = false,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
)

/**
 * Observable authentication state backing Login/Dashboard.
 *
 * - [onLoginClick] runs the whole Custom Tabs login; the Auth0 SDK resumes the
 *   suspended call when the user returns through its RedirectActivity.
 * - Typed [Auth0Exception] handling keeps error messages UI-ready.
 */
@HiltViewModel
class AuthViewModel @Inject constructor(
    private val auth0Client: Auth0Client,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    init {
        _uiState.update { it.copy(isAuthenticated = auth0Client.isAuthenticated()) }
    }

    /** [activityContext] is needed by the SDK to launch Custom Tabs. */
    fun onLoginClick(activityContext: Context) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            try {
                auth0Client.login(activityContext)
                _uiState.update { it.copy(isLoading = false, isAuthenticated = true) }
            } catch (e: Auth0Exception.AuthorizationCancelledException) {
                _uiState.update { it.copy(isLoading = false) }
            } catch (e: Auth0Exception) {
                _uiState.update { it.copy(isLoading = false, errorMessage = e.message) }
            }
        }
    }

    fun onLogoutClick(activityContext: Context) {
        viewModelScope.launch {
            auth0Client.logout(activityContext)
            _uiState.update { it.copy(isAuthenticated = false, errorMessage = null) }
        }
    }

    /**
     * Local-only session end (e.g. the refresh token expired while fetching
     * data). Flips the UI to the login screen without opening the Auth0
     * logout flow — there is no server-side session to end.
     */
    fun onSessionExpired() {
        _uiState.update { it.copy(isAuthenticated = false, errorMessage = null) }
    }
}
