import express from 'express';
import 'dotenv/config';
import { authMiddleware } from './middleware/auth.middleware';
import { createTenantMiddleware } from './middleware/tenant.middleware';
import { createAuditMiddleware } from './middleware/audit.middleware';
import credentialsRouter from './routes/credentials.routes';
import alertsRouter from './routes/alerts.routes';
import pool from './config/db';

const app = express();

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------

// Parse JSON request bodies
app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------------------
// Health check — no middleware chain required
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
// ---------------------------------------------------------------------------
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ): void => {
    console.error('[ERROR] Unhandled error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
);

// ---------------------------------------------------------------------------
// Server start
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[CLINICAL-COMPLIANCE] API listening on port ${PORT}`);
    console.log(`[CLINICAL-COMPLIANCE] Environment: ${process.env.NODE_ENV ?? 'development'}`);
  });
}

export default app;

