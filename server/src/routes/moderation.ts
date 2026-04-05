import { Router, Request, Response } from 'express';
import { moderateImage } from '../middleware/moderation.js';

const moderationRouter = Router();

moderationRouter.post('/moderate-image', async (req: Request, res: Response) => {
  const { image } = req.body;
  if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
    res.status(400).json({ error: 'Missing or invalid image data URL' });
    return;
  }

  const result = await moderateImage(image);
  res.json(result);
});

export { moderationRouter };
