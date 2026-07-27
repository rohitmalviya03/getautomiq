import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';
import { CheckoutDto, VerifyPaymentDto } from './dto/checkout.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentOrgId } from '../../common/decorators/current-org.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PERMISSIONS } from '../../common/constants/permissions.constant';

@ApiTags('billing')
@ApiBearerAuth()
@Controller({ path: 'billing', version: '1' })
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Creates a Razorpay order the browser opens in Checkout. */
  @Post('checkout')
  @ApiHeader({ name: 'x-organization-id', required: true })
  @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  checkout(
    @CurrentOrgId() organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CheckoutDto,
  ) {
    return this.payments.createCheckout(organizationId, userId, dto.plan, dto.cycle);
  }

  /** Verifies the checkout signature and activates the plan. */
  @Post('verify')
  @ApiHeader({ name: 'x-organization-id', required: true })
  @RequirePermissions(PERMISSIONS.BILLING_MANAGE)
  verify(@CurrentOrgId() organizationId: string, @Body() dto: VerifyPaymentDto) {
    return this.payments.verifyAndActivate(organizationId, dto);
  }

  /** Razorpay server-to-server webhook (signature-verified, unauthenticated). */
  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature?: string,
  ): Promise<{ received: true }> {
    await this.payments.handleWebhook(req.rawBody ?? Buffer.from(''), signature);
    return { received: true };
  }
}
