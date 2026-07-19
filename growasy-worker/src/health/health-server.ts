import http, { type Server } from 'http';
import type Redis from 'ioredis';

import { logger } from '../logger/logger';

/**
 * Minimal dependency-free HTTP server exposing GET /health for Docker /
 * orchestrator liveness probes. Pings the shared Redis connection so a
 * broken connection to the queue backend is visible to the probe instead of
 * the worker silently sitting idle.
 */
export function createHealthServer(redis: Redis): Server {
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== '/health') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }

    void checkRedis(redis).then((redisStatus) => {
      const status = redisStatus === 'up' ? 'ok' : 'degraded';
      res.writeHead(status === 'ok' ? 200 : 503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status, redis: redisStatus }));
    });
  });

  return server;
}

async function checkRedis(redis: Redis): Promise<'up' | 'down'> {
  try {
    const reply = await redis.ping();
    return reply === 'PONG' ? 'up' : 'down';
  } catch (err) {
    logger.warn({ err }, 'health check: redis ping failed');
    return 'down';
  }
}

export function startHealthServer(server: Server, port: number): Promise<void> {
  return new Promise((resolve) => {
    server.listen(port, () => {
      logger.info({ port }, 'health server listening');
      resolve();
    });
  });
}

export function stopHealthServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}
