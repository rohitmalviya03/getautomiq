import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PricingService } from './pricing.service';

/**
 * The public pricing catalogue. Unauthenticated on purpose — the marketing
 * landing page and the registration page render from it before anyone logs in.
 *
 * This is what makes admin pricing edits land everywhere: the storefront no
 * longer ships hardcoded prices, it reads this.
 */
@ApiTags('billing')
@Controller({ path: 'plans', version: '1' })
export class PlansController {
  constructor(private readonly pricing: PricingService) {}

  @Public()
  @Get()
  list() {
    return this.pricing.listPublicPlans();
  }
}
