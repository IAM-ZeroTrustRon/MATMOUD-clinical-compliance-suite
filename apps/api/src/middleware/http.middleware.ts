import { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';

/** Applies to success, denial, parser-error, and health responses alike. */
export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

/** Error objects may carry PHI, SQL, tokens, or provider payloads. Never echo/log them. */
export const apiErrorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (res.headersSent) {
    console.error('[API] Response stream failed');
    res.destroy();
    return;
  }
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'file_too_large' });
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: 'request_too_large' });
    return;
  }
  if (err instanceof SyntaxError && (err as SyntaxError & { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: 'invalid_json' });
    return;
  }
  // Intentionally identical in development: sensitive data is never a debug aid.
  console.error('[API] Request failed');
  res.status(500).json({ error: 'internal_error' });
};
