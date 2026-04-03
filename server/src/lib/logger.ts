import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';
const isTest = process.env.NODE_ENV === 'test';

export const logger = pino({
  level: isTest ? 'silent' : (process.env.LOG_LEVEL || (isDev ? 'debug' : 'info')),
  transport: isDev && !isTest ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
});

export function requestLogger() {
  return (req: any, res: any, next: any) => {
    const start = Date.now();
    const { method, url } = req;

    res.on('finish', () => {
      const duration = Date.now() - start;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      logger[level]({ method, url, status: res.statusCode, duration: `${duration}ms`, userId: req.auth?.userId }, 'request');
    });

    next();
  };
}
