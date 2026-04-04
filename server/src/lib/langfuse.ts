import { Langfuse } from 'langfuse';
import { logger } from './logger.js';

const hasKeys = !!(process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY);

let langfuse: Langfuse | null = null;

if (hasKeys) {
  langfuse = new Langfuse({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
    secretKey: process.env.LANGFUSE_SECRET_KEY!,
    baseUrl: process.env.LANGFUSE_BASEURL || 'https://cloud.langfuse.com',
  });
  logger.info('Langfuse observability enabled');
} else {
  logger.warn('Langfuse keys not configured — observability disabled');
}

export { langfuse };
