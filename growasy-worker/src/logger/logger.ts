import pino from 'pino';

/**
 * Process-wide structured logger. Pretty-prints in development for human
 * readability; emits raw NDJSON in production/test so log shippers (and CI)
 * get machine-parseable output.
 */
export const logger = pino({
  name: 'growasy-worker',
  level: process.env.LOG_LEVEL ?? 'info',
  transport:
    process.env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});
