import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from './config/config.module';
import { AppConfigService } from './config/app-config.service';
import { PrismaModule } from './prisma/prisma.module';
import { QueuesModule } from './queues/queues.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { InstagramModule } from './modules/instagram/instagram.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { AutomationModule } from './modules/automation/automation.module';
import { BillingModule } from './modules/billing/billing.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { LinksModule } from './modules/links/links.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { BlogModule } from './modules/blog/blog.module';
import { SeoModule } from './modules/seo/seo.module';
import { SupportModule } from './modules/support/support.module';
import { AdminModule } from './modules/admin/admin.module';
import { RevenueModule } from './modules/revenue/revenue.module';
import { HealthModule } from './modules/health/health.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { FeatureGuard } from './common/guards/feature.guard';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.isProduction ? 'info' : 'debug',
          transport: config.isProduction ? undefined : { target: 'pino-pretty' },
          autoLogging: true,
          redact: ['req.headers.authorization', 'req.headers.cookie'],
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        throttlers: [{ ttl: config.throttle.ttl, limit: config.throttle.limit }],
      }),
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    QueuesModule,
    HealthModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    BillingModule,
    InstagramModule,
    WebhooksModule,
    AutomationModule,
    ContactsModule,
    AnalyticsModule,
    LinksModule,
    NotificationsModule,
    WorkflowsModule,
    BlogModule,
    SeoModule,
    SupportModule,
    AdminModule,
    RevenueModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: FeatureGuard },
  ],
})
export class AppModule {}
