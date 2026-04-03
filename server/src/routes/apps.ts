import { Router } from 'express';
import { getApps, getAppById } from '../db/client.js';

const appsRouter = Router();

appsRouter.get('/apps', async (_req, res) => {
  const apps = await getApps();
  res.json(apps);
});

appsRouter.get('/apps/:id', async (req, res) => {
  const app = await getAppById(req.params.id);
  if (!app) {
    res.status(404).json({ error: 'App not found' });
    return;
  }
  res.json(app);
});

export { appsRouter };
