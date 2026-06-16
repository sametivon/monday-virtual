import { ConsoleLogger, LogLevel } from '@nestjs/common';

/**
 * Logger that emits one structured JSON line per record in production (so a log
 * collector — Render's stdout capture, Datadog, etc. — can parse fields), and
 * delegates to Nest's pretty ConsoleLogger in development. Keeps Nest's logging
 * surface (no framework swap); just changes the printer.
 */
export class JsonLogger extends ConsoleLogger {
  private readonly json = process.env.NODE_ENV === 'production';

  private emit(level: LogLevel, message: unknown, context?: string): void {
    if (!this.json) return;
    const line = {
      level,
      ts: new Date().toISOString(),
      context: context ?? this.context,
      message: typeof message === 'string' ? message : JSON.stringify(message),
    };
    process.stdout.write(`${JSON.stringify(line)}\n`);
  }

  override log(message: unknown, context?: string): void {
    if (this.json) this.emit('log', message, context);
    else super.log(message as string, context as string);
  }
  override error(message: unknown, stack?: string, context?: string): void {
    if (this.json) {
      this.emit('error', stack ? `${String(message)} ${stack}` : message, context);
    } else super.error(message as string, stack as string, context as string);
  }
  override warn(message: unknown, context?: string): void {
    if (this.json) this.emit('warn', message, context);
    else super.warn(message as string, context as string);
  }
  override debug(message: unknown, context?: string): void {
    if (this.json) this.emit('debug', message, context);
    else super.debug(message as string, context as string);
  }
  override verbose(message: unknown, context?: string): void {
    if (this.json) this.emit('verbose', message, context);
    else super.verbose(message as string, context as string);
  }
}
