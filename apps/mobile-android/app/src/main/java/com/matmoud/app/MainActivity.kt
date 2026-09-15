package com.matmoud.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import com.matmoud.app.ui.navigation.AppNavHost
import com.matmoud.app.ui.theme.MatMoudTheme
import com.matmoud.app.viewmodel.AuthViewModel
import dagger.hilt.android.AndroidEntryPoint

/**
 * Single activity, Compose UI. The OAuth redirect is handled by the Auth0
 * SDK's RedirectActivity, which resumes the pending login in [AuthViewModel].
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    private val authViewModel: AuthViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MatMoudTheme {
                AppNavHost(authViewModel = authViewModel)
            }
        }
    }
}
