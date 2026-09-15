package com.matmoud.app.di

import android.content.Context
import com.auth0.android.Auth0
import com.auth0.android.authentication.storage.SecureCredentialsManager
import com.auth0.android.authentication.storage.SharedPreferencesStorage
import com.matmoud.app.auth.Auth0Client
import com.matmoud.app.auth.Auth0Config
import com.matmoud.app.data.api.MobileAPIClient
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

/**
 * Hilt singleton graph: Auth0Config (BuildConfig values), the Auth0 account and
 * SecureCredentialsManager, the auth client, OkHttp, and the API client.
 */
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideAuth0Config(): Auth0Config = Auth0Config()

    @Provides
    @Singleton
    fun provideAuth0Account(config: Auth0Config): Auth0 =
        Auth0.getInstance(config.clientId, config.domain)

    /** Tokens are encrypted with an Android Keystore key before hitting SharedPreferences. */
    @Provides
    @Singleton
    fun provideCredentialsManager(
        @ApplicationContext context: Context,
        account: Auth0,
    ): SecureCredentialsManager =
        SecureCredentialsManager(context, account, SharedPreferencesStorage(context))

    @Provides
    @Singleton
    fun provideAuth0Client(
        config: Auth0Config,
        account: Auth0,
        credentialsManager: SecureCredentialsManager,
    ): Auth0Client = Auth0Client(config, account, credentialsManager)

    @Provides
    @Singleton
    fun provideOkHttpClient(): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()

    @Provides
    @Singleton
    fun provideMobileAPIClient(
        config: Auth0Config,
        okHttpClient: OkHttpClient,
    ): MobileAPIClient = MobileAPIClient(okHttpClient, config.apiBaseUrl)
}
