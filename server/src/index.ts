import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger, requestLogger } from './lib/logger.js';
import { clerkAuth, requireSession } from './middleware/auth.js';
import { securityHeaders, generalLimiter, chatLimiter } from './middleware/rateLimit.js';
import { healthRouter } from './routes/health.js';
import { appsRouter } from './routes/apps.js';
import { chatRouter } from './routes/chat.js';
import { oauthRouter } from './routes/oauth.js';
import { spotifyRouter } from './routes/spotify.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..', '..');

const app = express();

app.use(requestLogger());
app.use(securityHeaders);
app.use(cors());
app.use(express.json());
app.use('/api', generalLimiter);
app.use('/api/chat', chatLimiter);

// Static file serving
app.use('/apps', express.static(join(projectRoot, 'apps')));
app.use('/sdk', express.static(join(projectRoot, 'sdk')));

// Apply Clerk authentication middleware globally
app.use(clerkAuth);

// Public routes - no authentication required
app.use('/api', healthRouter);
app.use('/api', appsRouter);

// Protected routes - require authentication
app.use('/api/chat', requireSession);
app.use('/api/oauth', requireSession);
app.use('/api', chatRouter);
app.use('/api', oauthRouter);
app.use('/api', spotifyRouter);

// Frontend needs @clerk/clerk-react ClerkProvider with VITE_CLERK_PUBLISHABLE_KEY

const PORT = process.env.PORT || 3001;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info({ port: PORT, env: process.env.NODE_ENV || 'development' }, 'server started');
  });
}

export { app };
