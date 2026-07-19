import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Single place every uncaught error in the request pipeline funnels through.
 * Normalizes Nest HttpExceptions, Prisma errors, and unknown errors into the
 * same { success: false, error } envelope shape used by ResponseInterceptor
 * on the success path, and logs with enough context to trace an incident.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, error } = this.resolve(exception);

    this.logger.error(
      `${request.method} ${request.url} -> ${status} :: ${error.code} ${error.message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json({
      success: false,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private resolve(exception: unknown): { status: number; error: ErrorBody } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        return {
          status,
          error: {
            code: (b.error as string) ?? HttpStatus[status] ?? 'HTTP_ERROR',
            message: Array.isArray(b.message)
              ? b.message.join(', ')
              : ((b.message as string) ?? exception.message),
            details: Array.isArray(b.message) ? b.message : undefined,
          },
        };
      }
      return {
        status,
        error: { code: HttpStatus[status] ?? 'HTTP_ERROR', message: exception.message },
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.resolvePrismaError(exception);
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' },
    };
  }

  private resolvePrismaError(exception: Prisma.PrismaClientKnownRequestError) {
    switch (exception.code) {
      case 'P2002': {
        // Prisma's meta.target is a string[] on some connectors and a plain
        // string on others (e.g. MySQL) — normalize before joining or it crashes.
        const target = exception.meta?.target;
        const targetStr = Array.isArray(target)
          ? target.join(', ')
          : ((target as string | undefined) ?? 'value');
        return {
          status: HttpStatus.CONFLICT,
          error: {
            code: 'UNIQUE_CONSTRAINT_VIOLATION',
            message: `A record with this ${targetStr} already exists`,
          },
        };
      }
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          error: { code: 'NOT_FOUND', message: 'The requested resource was not found' },
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          error: {
            code: 'FOREIGN_KEY_CONSTRAINT_VIOLATION',
            message: 'Related resource does not exist',
          },
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: { code: 'DATABASE_ERROR', message: 'A database error occurred' },
        };
    }
  }
}
