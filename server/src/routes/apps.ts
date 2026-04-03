import { Router } from 'express';
import { getApps, getAppById } from '../db/client.js';
import { logger } from '../lib/logger.js';

const appsRouter = Router();

appsRouter.get('/apps', async (_req, res) => {
  try {
    const apps = await getApps();
    logger.debug({ count: apps.length }, 'apps listed');
    res.json(apps);
  } catch (err) {
    logger.error({ err }, 'failed to list apps');
    res.status(500).json({ error: 'Failed to load apps' });
  }
});

appsRouter.get('/apps/:id', async (req, res) => {
  try {
    const app = await getAppById(req.params.id);
    if (!app) {
      res.status(404).json({ error: 'App not found' });
      return;
    }
    res.json(app);
  } catch (err) {
    logger.error({ err, appId: req.params.id }, 'failed to get app');
    res.status(500).json({ error: 'Failed to load app' });
  }
});

export { appsRouter };
