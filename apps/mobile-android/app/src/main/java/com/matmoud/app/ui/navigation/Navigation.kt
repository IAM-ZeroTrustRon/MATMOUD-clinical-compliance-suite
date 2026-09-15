package com.matmoud.app.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.matmoud.app.ui.screens.DashboardScreen
import com.matmoud.app.ui.screens.LoginScreen
import com.matmoud.app.viewmodel.AuthViewModel

object Routes {
    const val LOGIN = "login"
    const val DASHBOARD = "dashboard"
}

@Composable
fun AppNavHost(authViewModel: AuthViewModel) {
    val navController = rememberNavController()
    val uiState by authViewModel.uiState.collectAsStateWithLifecycle()

    // Keep the nav graph glued to the auth state: signed-out -> Login,
    // signed-in -> Dashboard. popUpTo(0) drops the back stack so logout cannot
    // "go back" into a session screen.
    LaunchedEffect(uiState.isAuthenticated) {
        val destination = if (uiState.isAuthenticated) Routes.DASHBOARD else Routes.LOGIN
        navController.navigate(destination) {
            popUpTo(0) { inclusive = true }
        }
    }

    NavHost(
        navController = navController,
        startDestination = Routes.LOGIN,
    ) {
        composable(Routes.LOGIN) {
            LoginScreen(
                uiState = uiState,
                onLoginClick = authViewModel::onLoginClick,
            )
        }
        composable(Routes.DASHBOARD) {
            DashboardScreen(
                isAuthenticated = uiState.isAuthenticated,
                onLogout = authViewModel::onLogoutClick,
            )
        }
    }
}
