import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api', healthRouter);

const PORT = process.env.PORT || 3001;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export { app };
