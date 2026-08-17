import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { OnboardingService } from './onboarding.service';
import { CurrentOrgId } from '../../common/decorators/current-org.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../../common/constants/permissions.constant';

@ApiTags('onboarding')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', description: 'Active organization id', required: true })
@Controller({ path: 'onboarding', version: '1' })
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  /**
   * Progress through the first-run checklist.
   *
   * The permission is deliberate rather than decorative: PermissionsGuard skips
   * the membership check entirely on routes that declare none, so without one
   * any signed-in user could read another workspace's status by changing the
   * `x-organization-id` header. INSTAGRAM_ACCOUNT_READ is granted to every
   * system role down to Viewer, so requiring it locks nobody out.
   */
  @Get('status')
  @RequirePermissions(PERMISSIONS.INSTAGRAM_ACCOUNT_READ)
  status(@CurrentOrgId() organizationId: string) {
    return this.onboarding.status(organizationId);
  }
}
