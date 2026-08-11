import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiKeysService } from './api-keys.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PLAN_FEATURES } from '../../common/constants/plan-features.constant';

/** A request that carried a valid API key, with the org it resolved to. */
export interface ApiKeyRequest extends Request {
  apiKeyOrganizationId: string;
  apiKeyId: string;
}

/**
 * Authenticates server-to-server calls with an `Authorization: Bearer amq_live_…`
 * key instead of a user JWT. The organization comes from the key itself, never
 * from a header the caller controls — otherwise any valid key could write into
 * any workspace.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeys: ApiKeysService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiKeyRequest>();

    const header = request.headers.authorization ?? '';
    const presented = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!presented) {
      throw new UnauthorizedException('Provide your API key as "Authorization: Bearer <key>".');
    }

    const resolved = await this.apiKeys.resolve(presented);
    if (!resolved) {
      throw new UnauthorizedException('This API key is not valid.');
    }

    // Checked per request rather than at issuance: a workspace that downgrades
    // should stop being able to call the API, not keep a key that outlives its plan.
    const unlocked = await this.planLimits.hasFeature(
      resolved.organizationId,
      PLAN_FEATURES.API_ACCESS,
    );
    if (!unlocked) {
      throw new ForbiddenException({
        error: 'PLAN_FEATURE_LOCKED',
        message: 'API access is not included in your current plan.',
      });
    }

    request.apiKeyOrganizationId = resolved.organizationId;
    request.apiKeyId = resolved.apiKeyId;
    return true;
  }
}
