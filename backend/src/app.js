import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authentication, authRoutes, requireAuth } from './auth.js';
import { productRoutes } from './routes/products.js';
import { customerRoutes } from './routes/customers.js';
import { orderRoutes } from './routes/orders.js';
import { analyticsRoutes } from './routes/analytics.js';
import { adminRoutes } from './routes/admin.js';
import { connectionRoutes } from './routes/connections.js';
export function createApp(db) {
  const app = express();
  app.disable('x-powered-by');
  // Set only behind the controlled reverse proxy; the deployment binds the API to loopback.
  if (process.env.TRUST_PROXY_HOPS === '1') app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'blob:'],
          'connect-src': [
            "'self'",
            ...(process.env.CSP_CONNECT_ORIGINS || '').split(',').filter(Boolean),
          ],
          'worker-src': ["'self'", 'blob:'],
          'font-src': ["'self'", 'data:'],
          'upgrade-insecure-requests': null,
        },
      },
    }),
  );
  const origins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(
    ',',
  );
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || origins.includes(origin)),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', (req, res, next) => {
    if (
      req.body !== undefined &&
      (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body))
    )
      return res.status(400).json({ error: 'Send a JSON object.' });
    req.body ??= {};
    next();
  });
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(
    '/api',
    rateLimit({
      windowMs: 60 * 1000,
      limit: 300,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Too many requests. Try again shortly.' },
    }),
  );
  app.get('/api/health', (req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ ok: true, database: 'sqlite', persistent: true });
  });
  app.use('/api', authentication(db));
  app.use('/api/auth', authRoutes(db));
  app.use('/api', requireAuth);
  app.use('/api/products', productRoutes(db));
  app.use('/api/customers', customerRoutes(db));
  app.use('/api/orders', orderRoutes(db));
  app.use('/api', analyticsRoutes(db));
  app.use('/api', adminRoutes(db));
  app.use('/api', connectionRoutes(db));
  app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
  const frontend = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
  if (existsSync(frontend)) {
    app.use(express.static(frontend, { maxAge: '1h' }));
    app.get('/{*path}', (req, res) => res.sendFile(resolve(frontend, 'index.html')));
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (
      error.code?.startsWith('SQLITE_CONSTRAINT') ||
      String(error.message).includes('UNIQUE constraint failed')
    )
      return res.status(409).json({
        error: String(error.message).includes('products.barcode')
          ? 'This barcode is already assigned to another product.'
          : String(error.message).includes('products.sku')
            ? 'This SKU is already in use.'
            : String(error.message).includes('users.username')
              ? 'This username is already in use.'
              : 'This change conflicts with an existing record.',
      });
    if (error.type === 'entity.parse.failed')
      return res.status(400).json({ error: 'Invalid JSON request.' });
    if (!error.status) console.error(error);
    res.status(error.status || 500).json({
      error: error.status ? error.message : 'The server could not complete this request.',
    });
  });
  return app;
}
