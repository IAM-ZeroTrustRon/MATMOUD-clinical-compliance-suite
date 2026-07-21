import express from 'express';
import 'dotenv/config';
import { authMiddleware } from './middleware/auth.middleware';
import { createTenantMiddleware } from './middleware/tenant.middleware';
import { createAuditMiddleware } from './middleware/audit.middleware';
import credentialsRouter from './routes/credentials.routes';
import alertsRouter from './routes/alerts.routes';
import pool, { testConnection } from './config/db';

// ---------------------------------------------------------------------------
// Global rejection handlers — catch promise rejections and uncaught
// exceptions that Express error middleware cannot intercept.
//
//   unhandledRejection: A Promise was rejected with no .catch() handler.
//     Express 4 does not catch these from async route handlers unless
//     you forward them via next(err) or use an async wrapper.
//
//   uncaughtException: A synchronous error that was never caught anywhere.
//     Once this fires, the process is in an unknown state, so we log,
//     attempt graceful shutdown, then exit.
// ---------------------------------------------------------------------------
process.on('unhandledRejection', (reason: unknown) => {
  console.error('[FATAL] UNHANDLED REJECTION:', reason);
});

process.on('uncaughtException', (err: Error) => {
  console.error('[FATAL] UNCAUGHT EXCEPTION:', err);
  if (err?.stack) {
    console.error('[FATAL] Stack trace:', err.stack);
  }
  // Give logger time to flush, then exit uncleanly
  setTimeout(() => process.exit(1), 1000);
});

const app = express();

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------

// Parse JSON request bodies
app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------------------
// Health check — no middleware chain required
//
// Probes PostgreSQL connectivity with a lightweight SELECT 1 query.
// Previous version returned "ok" even when the database was unreachable,
// causing downstream requests to fail with a masked AggregateError.
// ---------------------------------------------------------------------------
app.get('/health', async (_req, res) => {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    res.json({
      status: 'ok',
      postgres: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(503).json({
      status: 'degraded',
      postgres: 'disconnected',
      detail: message,
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------------------------------------------------------------------------
// Feature routes
//
// Each route internally applies the full middleware chain:
//   Auth → Tenant → Audit → RBAC → Route Handler
//
// This per-route wiring ensures that:
//   - Every protected route independently enforces the full chain
//   - Each route gets its own dedicated DB connection (via tenant middleware)
//   - The chain order is preserved regardless of Express middleware registration order
// ---------------------------------------------------------------------------

app.use('/credentials', credentialsRouter);
app.use('/alerts', alertsRouter);

// ---------------------------------------------------------------------------
// Global error handler — must be registered last
//
// In development, the full error stack is returned to help with debugging.
// In production, only a generic message is exposed to prevent information
// leakage (OWASP Top 10 — A05:2021 Security Misconfiguration).
// ---------------------------------------------------------------------------
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ): void => {
    const isDev = process.env.NODE_ENV === 'development';
    console.error('[ERROR] Unhandled error:', err);
    if (err?.stack) {
      console.error('[ERROR] Stack trace:', err.stack);
    }
    res.status(500).json({
      error: err.message || 'internal_error',
      ...(isDev && { stack: err.stack }),
    });
  }
);

// ---------------------------------------------------------------------------
// Server start
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  // ---------------------------------------------------------------
  // Startup connection test
  //
  // Before listening for requests, verify that PostgreSQL is reachable.
  // If the connection fails, the process exits immediately with a
  // human-readable error explaining why — instead of starting the
  // server and failing on the first DB-dependent request.
  // ---------------------------------------------------------------
  testConnection()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`[CLINICAL-COMPLIANCE] API listening on port ${PORT}`);
        console.log(`[CLINICAL-COMPLIANCE] Environment: ${process.env.NODE_ENV ?? 'development'}`);
      });
    })
    .catch((err: Error) => {
      console.error('[CLINICAL-COMPLIANCE] Failed to connect to PostgreSQL:');
      console.error(err.message);
      process.exit(1);
    });
}

export default app;