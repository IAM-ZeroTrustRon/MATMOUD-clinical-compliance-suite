import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import 'dotenv/config';
import credentialsRouter from './routes/credentials.routes';
import alertsRouter from './routes/alerts.routes';
import auditRouter from './routes/audit.routes';
import { startAlertScheduler } from './services/scheduler';
import pool, { testConnection } from './config/db';
import { apiErrorHandler, noStore } from './middleware/http.middleware';

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
process.on('unhandledRejection', () => {
  console.error('[FATAL] UNHANDLED REJECTION');
});

process.on('uncaughtException', () => {
  console.error('[FATAL] UNCAUGHT EXCEPTION');
  // Give logger time to flush, then exit uncleanly
  setTimeout(() => process.exit(1), 1000);
});

const app = express();

// ---------------------------------------------------------------------------
// Edge hardening
//
// The API is reachable from the public internet before any route-level auth
// runs, so these controls are registered first and apply to health probes,
// unmatched routes, and error responses as well as to authenticated traffic.
// ---------------------------------------------------------------------------

app.disable('x-powered-by');

// Behind a managed load balancer or reverse proxy the socket address is the
// proxy, not the caller. Without this every client shares one rate-limit
// bucket and one logged source address. Default 0 = direct connections only;
// set TRUST_PROXY_HOPS=1 for a single managed proxy.
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) {
  app.set('trust proxy', trustProxyHops);
}

app.use(
  helmet({
    // The API serves JSON only; the web client's static host owns CSP.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  })
);

// ---------------------------------------------------------------------------
// CORS — explicit allowlist, deny by default
//
// Bearer-token auth means no cookies are sent cross-origin, so credentials are
// not enabled and the allowlist never needs to be a wildcard. In production an
// unset CORS_ORIGINS refuses every cross-origin browser request rather than
// falling back to localhost convenience.
// ---------------------------------------------------------------------------

const configuredOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins =
  configuredOrigins.length > 0
    ? configuredOrigins
    : process.env.NODE_ENV === 'production'
      ? []
      : ['http://localhost:5173', 'http://localhost:4173'];

if (process.env.NODE_ENV === 'production' && configuredOrigins.length === 0) {
  console.warn(
    '[API] CORS_ORIGINS is unset — all cross-origin browser requests will be refused'
  );
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Absent Origin: same-origin navigation, curl, and native mobile clients.
      if (!origin) return callback(null, true);
      callback(null, allowedOrigins.includes(origin));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 600,
  })
);

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------

// Parse JSON request bodies
app.use(noStore);
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
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
    res.json({
      status: 'ok',
      postgres: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({
      status: 'degraded',
      postgres: 'disconnected',
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

// ---------------------------------------------------------------------------
// Rate limiting — per client IP, feature routes only
//
// /health sits outside the limiter so liveness probes cannot be starved by
// application traffic. RATE_LIMIT_MAX is configurable for load tests and for
// clinics whose staff share a single NAT address; the default is sized for a
// small pilot tenant, not a whole health system.
// ---------------------------------------------------------------------------

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_MAX ?? 600),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited' },
});

// Routes with an outbound effect (alert dispatch reaches SendGrid) or that
// carry the credential token get a tighter bucket than ordinary reads.
const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_SENSITIVE_MAX ?? 60),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'rate_limited' },
});

app.use('/credentials', apiLimiter, credentialsRouter);
app.use('/alerts', sensitiveLimiter, alertsRouter);
app.use('/audit-logs', apiLimiter, auditRouter);

// ---------------------------------------------------------------------------
// Global error handler — must be registered last
//
// Raw errors and stacks are never exposed, including in development.
// ---------------------------------------------------------------------------
app.use(apiErrorHandler);

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
      // Start the daily alert checker
      startAlertScheduler();

      app.listen(PORT, () => {
        console.log(`[CLINICAL-COMPLIANCE] API listening on port ${PORT}`);
        console.log(`[CLINICAL-COMPLIANCE] Environment: ${process.env.NODE_ENV ?? 'development'}`);
      });
    })
    .catch(() => {
      console.error('[CLINICAL-COMPLIANCE] Failed to connect to PostgreSQL:');
      process.exit(1);
    });
}

export default app;
