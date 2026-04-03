import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';
import { appsRouter } from './routes/apps.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api', healthRouter);
app.use('/api', appsRouter);

const PORT = process.env.PORT || 3001;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export { app };
