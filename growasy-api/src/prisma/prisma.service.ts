import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: AppConfigService) {
    super({
      datasources: { db: { url: config.databaseUrl } },
      log: config.isProduction ? ['error', 'warn'] : ['warn', 'error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connected to MySQL via Prisma');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** Soft-delete helper: models covered by this map support `deletedAt`. */
  async softDelete<T extends { deletedAt?: Date | null }>(
    model: { update: (args: any) => Promise<T> },
    where: Record<string, unknown>,
  ): Promise<T> {
    return model.update({ where, data: { deletedAt: new Date() } });
  }
}
