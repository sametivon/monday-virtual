import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import * as Sentry from '@sentry/node';

/**
 * Global exception filter. HttpExceptions (incl. zod-pipe 400s, auth 401/403,
 * not-found 404) pass through with their status + body untouched. Anything else
 * is an unexpected 500: the full error is logged server-side (and sent to Sentry
 * if configured), but the client only ever sees a generic message in
 * production — never a stack trace or internal detail. In dev the real message
 * is included to keep debugging fast.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');
  private readonly isProd = process.env.NODE_ENV === 'production';

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      // The throttler's default body leaks its class name
      // ("ThrottlerException: Too Many Requests") — replace with human copy.
      if (status === HttpStatus.TOO_MANY_REQUESTS) {
        httpAdapter.reply(
          ctx.getResponse(),
          {
            statusCode: status,
            message: "You're doing that a little too fast — give it a few seconds and try again.",
          },
          status,
        );
        return;
      }
      httpAdapter.reply(ctx.getResponse(), exception.getResponse(), status);
      return;
    }

    // Unexpected error → 500. Log full detail server-side; report to Sentry.
    const err = exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error(err.message, err.stack);
    if (Sentry.getClient()) Sentry.captureException(exception);

    const body = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: this.isProd
        ? 'Something went wrong on our side. Please try again — if it keeps happening, reload the app.'
        : err.message,
      ts: new Date().toISOString(),
    };
    httpAdapter.reply(ctx.getResponse(), body, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
