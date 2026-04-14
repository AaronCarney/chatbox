import express from 'express';
import cors from 'cors';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger, requestLogger } from './lib/logger.js';
import { firebaseAuth, requireSession } from './middleware/firebaseAuth.js';
import { securityHeaders, generalLimiter, chatLimiter } from './middleware/rateLimit.js';
import { healthRouter } from './routes/health.js';
import { appsRouter } from './routes/apps.js';
import { chatRouter } from './routes/chat.js';
import { oauthRouter } from './routes/oauth.js';
import { spotifyRouter } from './routes/spotify.js';
import { natureRouter } from './routes/nature.js';
import { moderationRouter } from './routes/moderation.js';
import { seed } from './db/seed.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(requestLogger());
app.use(securityHeaders);
app.use(cors({
  origin: function (origin, callback) {
    const allowed = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
    // Accept: same origin, sandboxed iframes (null origin), and configured origin
    if (!origin || origin === 'null' || origin === allowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use('/api', generalLimiter);
app.use('/api/chat', chatLimiter);
app.use('/api/moderate-image', chatLimiter);

// Apply Firebase authentication middleware globally
app.use(firebaseAuth);

// Root endpoint — health beacon (no sensitive info)
app.get('/', (_req, res) => {
  res.json({ service: 'chatbridge-api', status: 'ok' });
});

// Public routes - no authentication required
app.use('/api', healthRouter);
app.use('/api', appsRouter);

// Protected routes - require authentication
app.use('/api/chat', requireSession);
app.use('/api', chatRouter);

// OAuth routes - public (popup window has no Clerk session; state param provides CSRF)
app.use('/api', oauthRouter);
app.use('/api', spotifyRouter);
app.use('/api', natureRouter);
app.use('/api', moderationRouter);

// Frontend uses Firebase AuthProvider with VITE_FIREBASE_* env vars

// Catch-all 404 with logging
app.use((req, res) => {
  logger.warn({ method: req.method, path: req.path, url: req.url, originalUrl: req.originalUrl }, '404 — no matching route');
  res.status(404).json({ error: 'Not Found', method: req.method, path: req.originalUrl });
});

// Global error handler
app.use((err: Error, req: any, res: any, _next: any) => {
  logger.error({ err, method: req.method, path: req.originalUrl, origin: req.headers.origin }, 'unhandled error');
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

const PORT = process.env.PORT || 3001;

let server: any;
if (process.env.NODE_ENV !== 'test') {
  seed().then(() => logger.info('database seeded')).catch(e => logger.error({ err: e }, 'seed failed'));
  server = app.listen(PORT, () => {
    logger.info({ port: PORT, env: process.env.NODE_ENV || 'development' }, 'server started');
  });
  server.on('error', (err: Error) => {
    logger.error({ err }, 'server error');
    process.exit(1);
  });
}

export { app, server };
