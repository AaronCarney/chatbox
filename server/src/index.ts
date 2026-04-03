import express from 'express';
import cors from 'cors';
import { clerkAuth, requireSession } from './middleware/auth.js';
import { securityHeaders, generalLimiter, chatLimiter } from './middleware/rateLimit.js';
import { healthRouter } from './routes/health.js';
import { appsRouter } from './routes/apps.js';
import { chatRouter } from './routes/chat.js';
import { oauthRouter } from './routes/oauth.js';
import { spotifyRouter } from './routes/spotify.js';

const app = express();

app.use(securityHeaders);
app.use(cors());
app.use(express.json());
app.use('/api', generalLimiter);
app.use('/api/chat', chatLimiter);

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
    console.log(`Server running on port ${PORT}`);
  });
}

export { app };
