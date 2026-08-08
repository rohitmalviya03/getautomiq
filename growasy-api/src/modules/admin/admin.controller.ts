import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuditAction } from '@prisma/client';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/jwt-payload.type';
import { AuthService } from '../auth/auth.service';
import { AdminService } from './admin.service';
import {
  AdjustUsageDto,
  AdminListQueryDto,
  ChangePlanDto,
  CompPlanDto,
  NotifyCustomerDto,
  SetActiveDto,
  SetSuperAdminDto,
} from './dto/admin.dto';
import { UpdatePlanDto, UpsertCouponDto } from './dto/pricing.dto';
import { AdminPricingService } from './admin-pricing.service';
import { AdminSupportService } from './admin-support.service';
import { TrafficService } from '../analytics/traffic.service';
import { BlogService } from '../blog/blog.service';
import {
  AdminBlogListQueryDto,
  CreateBlogPostDto,
  UpdateBlogPostDto,
} from '../blog/dto/blog.dto';
import {
  AdminReplyTicketDto,
  TicketListQueryDto,
  UpdateTicketDto,
} from '../support/dto/support.dto';

/**
 * Platform-owner back office. Every route sits behind the global JwtAuthGuard AND
 * SuperAdminGuard, so only User.isSuperAdmin === true may reach it. Mutations are
 * written to the AuditLog by AdminService.
 */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(SuperAdminGuard)
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly auth: AuthService,
    private readonly pricing: AdminPricingService,
    private readonly tickets: AdminSupportService,
    private readonly traffic: TrafficService,
    private readonly blog: BlogService,
  ) {}

  private meta(req: Request) {
    return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
  }

  @Get('overview')
  overview() {
    return this.admin.getOverview();
  }

  // --- Customers -------------------------------------------------------------

  @Get('customers')
  listCustomers(@Query() query: AdminListQueryDto) {
    return this.admin.listCustomers(query);
  }

  @Get('customers/:id')
  getCustomer(@Param('id') id: string) {
    return this.admin.getCustomer(id);
  }

  @Patch('customers/:id/plan')
  changePlan(
    @Param('id') id: string,
    @Body() dto: ChangePlanDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.admin.changePlan(id, dto, actor, this.meta(req));
  }

  @Post('customers/:id/suspend')
  @HttpCode(HttpStatus.OK)
  suspendOrg(
    @Param('id') id: string,
    @Body() dto: SetActiveDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.admin.setOrgActive(id, false, dto, actor, this.meta(req));
  }

  @Post('customers/:id/reactivate')
  @HttpCode(HttpStatus.OK)
  reactivateOrg(
    @Param('id') id: string,
    @Body() dto: SetActiveDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.admin.setOrgActive(id, true, dto, actor, this.meta(req));
  }

  @Patch('customers/:id/usage')
  adjustUsage(
    @Param('id') id: string,
    @Body() dto: AdjustUsageDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.admin.adjustUsage(id, dto, actor, this.meta(req));
  }

  @Post('customers/:id/comp')
  @HttpCode(HttpStatus.OK)
  comp(
    @Param('id') id: string,
    @Body() dto: CompPlanDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.admin.compPlan(id, dto, actor, this.meta(req));
  }

  @Post('customers/:id/notify')
  @HttpCode(HttpStatus.OK)
  notify(
    @Param('id') id: string,
    @Body() dto: NotifyCustomerDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.admin.notifyCustomer(id, dto, actor, this.meta(req));
  }

  @Post('customers/:id/accounts/:accountId/disconnect')
  @HttpCode(HttpStatus.OK)
  disconnectAccount(
    @Param('id') id: string,
    @Param('accountId') accountId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.admin.disconnectAccount(id, accountId, actor, this.meta(req));
  }

  @Post('customers/:id/impersonate')
  @HttpCode(HttpStatus.OK)
  async impersonate(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const org = await this.admin.resolveImpersonationTarget(id);
    const tokens = await this.auth.issueImpersonationSession(org.owner, this.meta(req));

    await this.admin.audit(actor, this.meta(req), {
      action: AuditAction.LOGIN,
      entityType: 'Impersonation',
      entityId: org.id,
      organizationId: org.id,
      after: { impersonatedUserId: org.owner.id, impersonatedEmail: org.owner.email },
    });

    return {
      tokens,
      user: {
        id: org.owner.id,
        email: org.owner.email,
        firstName: org.owner.firstName,
        lastName: org.owner.lastName,
      },
      organization: { id: org.id, name: org.name, slug: org.slug },
    };
  }

  // --- Users -----------------------------------------------------------------

  @Get('users')
  listUsers(@Query() query: AdminListQueryDto) {
    return this.admin.listUsers(query);
  }

  @Patch('users/:id/super-admin')
  setSuperAdmin(
    @Param('id') id: string,
    @Body() dto: SetSuperAdminDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.admin.setUserSuperAdmin(id, dto, actor, this.meta(req));
  }

  @Post('users/:id/verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.admin.verifyUserEmail(id, actor, this.meta(req));
  }

  @Post('users/:id/suspend')
  @HttpCode(HttpStatus.OK)
  suspendUser(
    @Param('id') id: string,
    @Body() dto: SetActiveDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.admin.setUserSuspended(id, true, dto, actor, this.meta(req));
  }

  @Post('users/:id/reactivate')
  @HttpCode(HttpStatus.OK)
  reactivateUser(
    @Param('id') id: string,
    @Body() dto: SetActiveDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.admin.setUserSuspended(id, false, dto, actor, this.meta(req));
  }

  // --- Pricing ---------------------------------------------------------------

  /** The full catalogue, including hidden/inactive plans, with computed prices. */
  @Get('plans')
  listPlans() {
    return this.pricing.listPlans();
  }

  /** Edits price / copy / limits / promo. Takes effect everywhere immediately. */
  @Patch('plans/:id')
  updatePlan(
    @Param('id') id: string,
    @Body() dto: UpdatePlanDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.pricing.updatePlan(id, dto, actor, this.meta(req));
  }

  // --- Coupons ---------------------------------------------------------------

  @Get('coupons')
  listCoupons() {
    return this.pricing.listCoupons();
  }

  @Post('coupons')
  createCoupon(
    @Body() dto: UpsertCouponDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.pricing.createCoupon(dto, actor, this.meta(req));
  }

  @Patch('coupons/:id')
  updateCoupon(
    @Param('id') id: string,
    @Body() dto: UpsertCouponDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.pricing.updateCoupon(id, dto, actor, this.meta(req));
  }

  /** Deactivate (never hard-delete — redemptions reference the coupon). */
  @Post('coupons/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  deactivateCoupon(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.pricing.deactivateCoupon(id, actor, this.meta(req));
  }

  @Get('coupons/:id/redemptions')
  couponRedemptions(@Param('id') id: string) {
    return this.pricing.couponRedemptions(id);
  }

  // --- Blog ------------------------------------------------------------------

  @Get('blog')
  listPosts(@Query() query: AdminBlogListQueryDto) {
    return this.blog.listForAdmin(query);
  }

  @Get('blog/:id')
  getPost(@Param('id') id: string) {
    return this.blog.getForAdmin(id);
  }

  @Post('blog')
  createPost(@Body() dto: CreateBlogPostDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.blog.create(dto, actor);
  }

  @Patch('blog/:id')
  updatePost(@Param('id') id: string, @Body() dto: UpdateBlogPostDto) {
    return this.blog.update(id, dto);
  }

  /** Soft delete — the slug stays reserved so an old URL can never be reused. */
  @Delete('blog/:id')
  deletePost(@Param('id') id: string) {
    return this.blog.remove(id);
  }

  // --- Traffic ---------------------------------------------------------------

  /** Visitors, views and the signup funnel. Lookback capped at 90 days. */
  @Get('traffic')
  trafficOverview(@Query('days') days?: string) {
    const parsed = Number(days);
    const range = Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 1), 90) : 30;
    return this.traffic.overview(range);
  }

  // --- Support tickets -------------------------------------------------------

  @Get('tickets')
  listTickets(@Query() query: TicketListQueryDto) {
    return this.tickets.list(query);
  }

  @Get('tickets/:id')
  ticketDetail(@Param('id') id: string) {
    return this.tickets.detail(id);
  }

  /** Public reply, or an internal note the customer never sees. */
  @Post('tickets/:id/reply')
  @HttpCode(HttpStatus.CREATED)
  replyTicket(
    @Param('id') id: string,
    @Body() dto: AdminReplyTicketDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tickets.reply(id, dto, actor);
  }

  @Patch('tickets/:id')
  updateTicket(
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.tickets.update(id, dto, actor, this.meta(req));
  }

  // --- Audit -----------------------------------------------------------------

  @Get('audit-log')
  auditLog(@Query() query: AdminListQueryDto) {
    return this.admin.listAuditLog(query);
  }
}
