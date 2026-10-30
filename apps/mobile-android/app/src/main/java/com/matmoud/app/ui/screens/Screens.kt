package com.matmoud.app.ui.screens

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.matmoud.app.data.api.Credential
import com.matmoud.app.viewmodel.AuthUiState
import com.matmoud.app.viewmodel.CredentialsUiState
import com.matmoud.app.viewmodel.CredentialsViewModel

/**
 * Sign-in screen. Login runs in Chrome Custom Tabs via the Auth0 SDK
 * (RFC 8252); the button hands over the Activity context the SDK needs.
 */
@Composable
fun LoginScreen(
    uiState: AuthUiState,
    onLoginClick: (Context) -> Unit,
) {
    val context = LocalContext.current

    Scaffold { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text("MAT/MOUD Compliance", style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(8.dp))
            Text(
                "Secure provider credential & CEU tracking",
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(32.dp))

            if (uiState.isLoading) {
                CircularProgressIndicator()
            } else {
                Button(onClick = { onLoginClick(context) }, modifier = Modifier.fillMaxWidth()) {
                    Text("Sign in with Auth0")
                }
            }

            uiState.errorMessage?.let { message ->
                Spacer(Modifier.height(16.dp))
                Text(
                    message,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

/**
 * Authenticated landing screen (Phase 3b): renders the Credentials list from
 * `GET /credentials` via [CredentialsViewModel].
 *
 * PHI fields are displayed exactly as the API returns them; a Tier 3 user sees
 * the server's `[RESTRICTED]` marker, a Tier 4+ user sees the value. The client
 * does not make its own access decisions (Minimum Necessary is server-side).
 */
@Composable
fun DashboardScreen(
    onLogout: (Context) -> Unit,
    onSessionExpired: () -> Unit,
) {
    val viewModel: CredentialsViewModel = hiltViewModel()
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    // No usable session (refresh token expired): hand control back to AuthViewModel.
    LaunchedEffect(uiState.sessionExpired) {
        if (uiState.sessionExpired) onSessionExpired()
    }

    CredentialsScreen(
        uiState = uiState,
        onRetry = viewModel::load,
        onLogout = onLogout,
    )
}
@Composable
internal fun CredentialsScreen(
    uiState: CredentialsUiState,
    onRetry: () -> Unit,
    onLogout: (Context) -> Unit,
) {
    val context = LocalContext.current

    Scaffold { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(24.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "Credentials",
                    style = MaterialTheme.typography.headlineMedium,
                )
                OutlinedButton(onClick = { onLogout(context) }) {
                    Text("Log out")
                }
            }
            Spacer(Modifier.height(8.dp))
            Text(
                "Provider licenses & expirations for this tenant",
                style = MaterialTheme.typography.bodySmall,
            )
            Spacer(Modifier.height(16.dp))

            when {
                uiState.isLoading -> {
                    Column(
                        modifier = Modifier.fillMaxSize(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        CircularProgressIndicator()
                    }
                }

                uiState.credentials.isNotEmpty() -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(uiState.credentials, key = { it.id }) { credential ->
                            CredentialRow(credential)
                        }
                    }
                }

                uiState.errorMessage != null -> {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(
                            uiState.errorMessage,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyMedium,
                            textAlign = TextAlign.Center,
                        )
                        Spacer(Modifier.height(12.dp))
                        Button(onClick = onRetry) {
                            Text("Retry")
                        }
                    }
                }

                else -> {
                    Column(
                        modifier = Modifier.fillMaxSize(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Text(
                            "No credentials found for this tenant.",
                            style = MaterialTheme.typography.bodyMedium,
                            textAlign = TextAlign.Center,
                        )
                        Spacer(Modifier.height(12.dp))
                        Button(onClick = onRetry) {
                            Text("Refresh")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CredentialRow(credential: Credential) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
    ) {
        if (!credential.providerName.isNullOrBlank()) {
            LabeledRow(label = "Provider", value = credential.providerName)
        }
        if (!credential.licenseNumber.isNullOrBlank()) {
            LabeledRow(label = "License", value = credential.licenseNumber)
        }
        if (!credential.expirationDate.isNullOrBlank()) {
            LabeledRow(label = "Expires", value = credential.expirationDate)
        }
        if (credential.isRedacted) {
            Spacer(Modifier.height(2.dp))
            Text(
                "Some fields are restricted for your role",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.outline,
            )
        }
        Spacer(Modifier.height(8.dp))
        HorizontalDivider()
    }
}

@Composable
private fun LabeledRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth()) {
        Text(
            "$label:",
            modifier = Modifier.weight(0.35f),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.outline,
        )
        Text(
            value,
            modifier = Modifier.weight(0.65f),
            style = MaterialTheme.typography.bodyMedium,
        )
    }
}

