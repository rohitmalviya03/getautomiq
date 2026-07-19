import http from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createHealthServer, startHealthServer, stopHealthServer } from './health-server';

function fakeRedis(pingImpl: () => Promise<string>) {
  return { ping: vi.fn(pingImpl) } as unknown as import('ioredis').default;
}

function get(port: number, path = '/health'): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${port}${path}`, (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) });
        });
      })
      .on('error', reject);
  });
}

describe('health server', () => {
  let server: http.Server | undefined;

  afterEach(async () => {
    if (server) {
      await stopHealthServer(server);
      server = undefined;
    }
  });

  it('returns 200 with redis: up when Redis responds PONG', async () => {
    const redis = fakeRedis(async () => 'PONG');
    server = createHealthServer(redis);
    await startHealthServer(server, 0);
    const port = (server.address() as { port: number }).port;

    const { status, body } = await get(port);

    expect(status).toBe(200);
    expect(body).toEqual({ status: 'ok', redis: 'up' });
  });

  it('returns 503 with redis: down when Redis ping throws', async () => {
    const redis = fakeRedis(async () => {
      throw new Error('connection refused');
    });
    server = createHealthServer(redis);
    await startHealthServer(server, 0);
    const port = (server.address() as { port: number }).port;

    const { status, body } = await get(port);

    expect(status).toBe(503);
    expect(body).toEqual({ status: 'degraded', redis: 'down' });
  });

  it('returns 404 for unknown routes', async () => {
    const redis = fakeRedis(async () => 'PONG');
    server = createHealthServer(redis);
    await startHealthServer(server, 0);
    const port = (server.address() as { port: number }).port;

    const { status } = await get(port, '/nope');

    expect(status).toBe(404);
  });
});
