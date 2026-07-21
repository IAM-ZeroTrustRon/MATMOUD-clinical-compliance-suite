# MAT/MOUD Clinical Compliance Suite — Beta Status

## Core Infrastructure ✅
- [x] PostgreSQL connection with startup test (`testConnection()` in `db.ts`)
- [x] Health endpoint with DB probe (`GET /health` returns `postgres: "connected"`)
- [x] Server fails fast if DB unreachable (clear error, not masked AggregateError)
- [x] MFA enforcement re-enabled (SMS auth rejected with 401)
- [x] Audit middleware uses safe `res.on('finish')` instead of patching `res.end()`
- [x] Import order fixed in `run-migrations.ts` (dotenv before pool)
- [x] TypeScript compiles with zero errors

## Beta Module Status (from README)

| Module | Status | Notes |
|---|---|---|
| Login & Org Setup (Auth0 + MFA) | ✅ Code complete | Requires valid Auth0 JWT to test |
| Credential Dashboard | ✅ Code complete | Protected by auth middleware |
| Document Upload (S3 SSE-KMS) | ✅ Code complete | Requires AWS S3 + KMS config |
| Email Alerts Workflow | ✅ Code complete | Requires SendGrid API key |
| Audit Trail | ✅ Code complete | INSERT-only table, requires DB migration |

## To Fully Test All Routes
- [ ] Generate a valid Auth0 JWT with MFA claims (`amr` includes `totp` or `fido`)
- [ ] Set up AWS S3 bucket + KMS key for document upload
- [ ] Configure SendGrid API key for email alerts
- [ ] Set environment variables in `.env` for all services