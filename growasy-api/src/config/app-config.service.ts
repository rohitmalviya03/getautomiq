import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from './env.validation';
import { DEFAULT_META_OAUTH_SCOPES } from '../common/constants/meta.constant';

/**
 * Thin typed wrapper around ConfigService so the rest of the app never touches
 * raw process.env or untyped `get<string>('X')` calls.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  get nodeEnv() {
    return this.config.get('NODE_ENV', { infer: true });
  }

  get isProduction() {
    return this.nodeEnv === 'production';
  }

  get port() {
    return this.config.get('PORT', { infer: true });
  }

  get apiPrefix() {
    return this.config.get('API_PREFIX', { infer: true });
  }

  get apiVersion() {
    return this.config.get('API_VERSION', { infer: true });
  }

  get corsOrigins() {
    return this.config
      .get('CORS_ORIGINS', { infer: true })
      .split(',')
      .map((origin) => origin.trim());
  }

  get databaseUrl() {
    return this.config.get('DATABASE_URL', { infer: true });
  }

  get redis() {
    return {
      host: this.config.get('REDIS_HOST', { infer: true }),
      port: this.config.get('REDIS_PORT', { infer: true }),
      password: this.config.get('REDIS_PASSWORD', { infer: true }) || undefined,
    };
  }

  get jwt() {
    return {
      accessSecret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      accessExpiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN', { infer: true }),
      refreshSecret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      refreshExpiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', { infer: true }),
      refreshRememberExpiresIn: this.config.get('JWT_REFRESH_REMEMBER_EXPIRES_IN', {
        infer: true,
      }),
    };
  }

  get bcryptSaltRounds() {
    return this.config.get('BCRYPT_SALT_ROUNDS', { infer: true });
  }

  get encryptionKey() {
    return this.config.get('ENCRYPTION_KEY', { infer: true });
  }

  get emailVerificationTtlHours() {
    return this.config.get('EMAIL_VERIFICATION_TOKEN_TTL_HOURS', { infer: true });
  }

  get passwordResetTtlMinutes() {
    return this.config.get('PASSWORD_RESET_TOKEN_TTL_MINUTES', { infer: true });
  }

  get throttle() {
    return {
      ttl: this.config.get('THROTTLE_TTL_SECONDS', { infer: true }) * 1000,
      limit: this.config.get('THROTTLE_LIMIT', { infer: true }),
    };
  }

  get meta() {
    const metaAppId = this.config.get('META_APP_ID', { infer: true });
    const metaAppSecret = this.config.get('META_APP_SECRET', { infer: true });
    return {
      // Facebook/Meta App ID+Secret (Dashboard > Settings > Basic). Kept for
      // reference / future Facebook-based calls; NOT used by the Instagram Login flow.
      appId: metaAppId,
      appSecret: metaAppSecret,

      // Instagram App ID+Secret (Dashboard > Instagram > API setup with Instagram
      // Login). These are DIFFERENT numbers from the Facebook App ID/Secret and are
      // the ones the Instagram Login authorize URL + token exchange must use.
      // Passing the Facebook App ID here is what produces "Invalid platform app".
      // Fall back to the Meta values so older single-app setups keep working.
      instagramAppId: this.config.get('INSTAGRAM_APP_ID', { infer: true }) || metaAppId,
      instagramAppSecret: this.config.get('INSTAGRAM_APP_SECRET', { infer: true }) || metaAppSecret,

      redirectUri: this.config.get('META_REDIRECT_URI', { infer: true }),
      webhookVerifyToken: this.config.get('META_WEBHOOK_VERIFY_TOKEN', { infer: true }),
      skipWebhookSignature: this.config.get('META_SKIP_WEBHOOK_SIGNATURE', { infer: true }),
      graphApiVersion: this.config.get('META_GRAPH_API_VERSION', { infer: true }),
      oauthScopes:
        this.config.get('META_OAUTH_SCOPES', { infer: true }) || DEFAULT_META_OAUTH_SCOPES,
    };
  }

  get webAppUrl() {
    return this.config.get('WEB_APP_URL', { infer: true });
  }
}
