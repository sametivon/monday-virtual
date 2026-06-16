/**
 * Minimal structural type for the Express response object we get from `@Res()`,
 * covering only the methods our file-download handlers use. Avoids a direct
 * dependency on `@types/express` (Nest's platform-express provides the runtime
 * object; we only need to describe the two calls we make).
 */
export interface CsvResponse {
  setHeader(name: string, value: string): void;
  send(body: string): void;
}
