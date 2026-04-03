import express from 'express';
import cors from 'cors';
import { securityHeaders, generalLimiter, chatLimiter } from './middleware/rateLimit.js';
import { healthRouter } from './routes/health.js';
import { appsRouter } from './routes/apps.js';
import { chatRouter } from './routes/chat.js';
import { oauthRouter } from './routes/oauth.js';

const app = express();

app.use(securityHeaders);
app.use(cors());
app.use(express.json());
app.use('/api', generalLimiter);
app.use('/api/chat', chatLimiter);
app.use('/api', healthRouter);
app.use('/api', appsRouter);
app.use('/api', chatRouter);
app.use('/api', oauthRouter);

const PORT = process.env.PORT || 3001;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export { app };
