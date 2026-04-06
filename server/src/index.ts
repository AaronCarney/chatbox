import express from 'express';
import cors from 'cors';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger, requestLogger } from './lib/logger.js';
import { clerkAuth, requireSession } from './middleware/auth.js';
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
}));
app.use(express.json());
app.use('/api', generalLimiter);
app.use('/api/chat', chatLimiter);
app.use('/api/moderate-image', chatLimiter);

// Apply Clerk authentication middleware globally
app.use(clerkAuth);

// Root diagnostic endpoint
app.get('/', (_req, res) => {
  res.json({
    service: 'chatbridge-api',
    status: 'ok',
    routes: ['/api/health', '/api/apps', '/api/chat', '/api/nature/*', '/api/spotify/*'],
    env: {
      hasClerkKeys: !!(process.env.CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY),
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      allowedOrigin: process.env.ALLOWED_ORIGIN || '(default: http://localhost:5173)',
      nodeEnv: process.env.NODE_ENV || '(not set)',
    },
  });
});

// Public routes - no authentication required
app.use('/api', healthRouter);
app.use('/api', appsRouter);

// Auth diagnostic — same middleware chain as /api/chat but GET for testing
app.get('/api/chat-check', requireSession, (req, res) => {
  res.json({ auth: 'ok', userId: (req as any).auth?.userId || null });
});

// Protected routes - require authentication
app.use('/api/chat', requireSession);
app.use('/api', chatRouter);

// OAuth routes - public (popup window has no Clerk session; state param provides CSRF)
app.use('/api', oauthRouter);
app.use('/api', spotifyRouter);
app.use('/api', natureRouter);
app.use('/api', moderationRouter);

// Frontend needs @clerk/clerk-react ClerkProvider with VITE_CLERK_PUBLISHABLE_KEY

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
