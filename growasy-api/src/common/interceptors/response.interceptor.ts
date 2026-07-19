import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { IS_RAW_RESPONSE_KEY } from '../decorators/raw-response.decorator';

export interface ResponseEnvelope<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Wraps every successful controller return value in a consistent envelope so
 * frontend/worker clients never need to branch on response shape per-endpoint.
 * Controllers may return { data, meta } to populate `meta` (pagination cursors etc.),
 * otherwise the whole return value becomes `data`.
 *
 * Routes/controllers marked with @RawResponse() are passed through untouched —
 * e.g. the Meta webhook handshake, which must return a raw plain-text challenge.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ResponseEnvelope<T> | T> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<ResponseEnvelope<T> | T> {
    const isRaw = this.reflector.getAllAndOverride<boolean>(IS_RAW_RESPONSE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isRaw) {
      return next.handle();
    }

    return next.handle().pipe(
      map((result) => {
        if (result && typeof result === 'object' && 'data' in result && 'meta' in result) {
          return {
            success: true,
            data: (result as any).data,
            meta: (result as any).meta,
            timestamp: new Date().toISOString(),
          };
        }
        return {
          success: true,
          data: result,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
