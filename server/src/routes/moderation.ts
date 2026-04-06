import { Router, Request, Response } from 'express';
import { moderateImage } from '../middleware/moderation.js';

const moderationRouter = Router();

moderationRouter.post('/moderate-image', async (req: Request, res: Response) => {
  const { image } = req.body;
  if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
    res.status(400).json({ error: 'Missing or invalid image data URL' });
    return;
  }

  try {
    const result = await moderateImage(image);
    res.json(result);
  } catch {
    res.status(500).json({ flagged: false, categories: {}, categoryScores: {} });
  }
});

export { moderationRouter };
