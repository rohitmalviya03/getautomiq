import { z } from 'zod';

/**
 * Zod-validated process environment. Mirrors the validation style used in
 * growasy-api/src/config/env.validation.ts for consistency across the
 * polyrepo, but is intentionally its own copy — the two services are
 * deployed and configured independently.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Same Redis instance growasy-api produces BullMQ jobs to.
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),

  // Same MySQL database growasy-api owns. The worker only reads/writes through
  // the generated Prisma client (it never runs migrations — the API owns those).
  DATABASE_URL: z.string(),

  // AES-256-GCM key (64 hex chars) — MUST match growasy-api's ENCRYPTION_KEY, or
  // the worker cannot decrypt the Instagram access tokens the API stored.
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be 64 hex characters'),

  // Instagram Graph API version + base used for DM/reply calls.
  META_GRAPH_API_VERSION: z.string().default('v20.0'),
  INSTAGRAM_GRAPH_BASE: z.string().default('https://graph.instagram.com'),

  // Concurrency for the two Instagram automation queues.
  WEBHOOK_PROCESSING_CONCURRENCY: z.coerce.number().default(10),
  AUTOMATION_EXECUTION_CONCURRENCY: z.coerce.number().default(5),

  // SMTP transport nodemailer sends through.
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASSWORD: z.string().optional().default(''),
  MAIL_FROM: z.string().default('Automiq <hello@getautomiq.online>'),

  // Base URL of growasy-web, used only for constructing links inside emails
  // if a job payload were ever missing one; the queue contract already sends
  // fully-formed URLs, this is a defensive fallback.
  WEB_APP_URL: z.string().default('http://localhost:5173'),

  // Port the /health HTTP endpoint listens on (not part of the API contract
  // — this service has no public API, the port is only for orchestration
  // probes such as Docker HEALTHCHECK or a Kubernetes liveness probe).
  HEALTH_PORT: z.coerce.number().default(4100),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown> = process.env): EnvConfig {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${formatted}`);
  }
  return parsed.data;
}
