import { TrafficService } from './traffic.service';
import { PrismaService } from '../../prisma/prisma.service';

function makeService() {
  const create = jest.fn().mockResolvedValue({});
  const prisma = { pageView: { create } } as unknown as PrismaService;
  return { service: new TrafficService(prisma), create };
}

/** The data written for the single recorded view. */
function written(create: jest.Mock): Record<string, unknown> {
  return create.mock.calls[0][0].data as Record<string, unknown>;
}

describe('TrafficService.track', () => {
  const CHROME =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

  it('records a view for a real browser', async () => {
    const { service, create } = makeService();

    const result = await service.track({ path: '/', ip: '1.2.3.4', userAgent: CHROME });

    expect(result).toEqual({ recorded: true });
    expect(create).toHaveBeenCalledTimes(1);
  });

  // Crawlers hit the landing page constantly; counting them would make the
  // visitor numbers meaningless.
  it.each([
    'Googlebot/2.1 (+http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0)',
    'facebookexternalhit/1.1',
    'GPTBot/1.0',
    'curl/8.4.0',
    'WhatsApp/2.23',
  ])('ignores bot user agent: %s', async (ua) => {
    const { service, create } = makeService();

    const result = await service.track({ path: '/', ip: '1.2.3.4', userAgent: ua });

    expect(result).toEqual({ recorded: false });
    expect(create).not.toHaveBeenCalled();
  });

  it('never stores the raw IP or user agent', async () => {
    const { service, create } = makeService();

    await service.track({ path: '/', ip: '203.0.113.9', userAgent: CHROME });

    const serialised = JSON.stringify(written(create));
    expect(serialised).not.toContain('203.0.113.9');
    expect(serialised).not.toContain('AppleWebKit');
    expect(written(create).visitorHash).toHaveLength(64);
  });

  it('gives the same visitor the same hash within a day, and different visitors different ones', async () => {
    const a = makeService();
    await a.service.track({ path: '/', ip: '1.1.1.1', userAgent: CHROME });
    await a.service.track({ path: '/tools', ip: '1.1.1.1', userAgent: CHROME });
    const [first, second] = a.create.mock.calls.map((c) => c[0].data.visitorHash);
    expect(first).toBe(second);

    const b = makeService();
    await b.service.track({ path: '/', ip: '9.9.9.9', userAgent: CHROME });
    expect(b.create.mock.calls[0][0].data.visitorHash).not.toBe(first);
  });

  it('keeps only the referrer host, dropping the path and query', async () => {
    const { service, create } = makeService();

    await service.track({
      path: '/',
      userAgent: CHROME,
      referrer: 'https://www.google.com/search?q=secret+term&email=a@b.com',
    });

    expect(written(create).referrerHost).toBe('google.com');
  });

  it('collapses ids in the path so top-pages does not fragment', async () => {
    const { service, create } = makeService();

    await service.track({
      path: '/workflows/3f8b1c2d-4a5e-6789-b012-3456789abcde?tab=edit',
      userAgent: CHROME,
    });

    expect(written(create).path).toBe('/workflows/:id');
  });

  it('separates app surface from public marketing traffic', async () => {
    const app = makeService();
    await app.service.track({ path: '/dashboard', userAgent: CHROME });
    expect(written(app.create).surface).toBe('app');

    const pub = makeService();
    await pub.service.track({ path: '/tools/instagram-caption-generator', userAgent: CHROME });
    expect(written(pub.create).surface).toBe('public');
  });

  it('buckets the device from the user agent', async () => {
    const mobile = makeService();
    await mobile.service.track({
      path: '/',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1 Mobile/15E148 Safari/604.1',
    });
    expect(written(mobile.create).deviceType).toBe('mobile');

    const desktop = makeService();
    await desktop.service.track({ path: '/', userAgent: CHROME });
    expect(written(desktop.create).deviceType).toBe('desktop');
  });

  // A failed insert must never surface to the visitor's page load.
  it('swallows database errors', async () => {
    const prisma = {
      pageView: { create: jest.fn().mockRejectedValue(new Error('db down')) },
    } as unknown as PrismaService;

    await expect(
      new TrafficService(prisma).track({ path: '/', userAgent: CHROME }),
    ).resolves.toEqual({ recorded: false });
  });
});
