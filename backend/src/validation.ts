/**
 * Helpers de validacion para query params y bodies. No usamos zod aqui
 * para mantener el bundle del api liviano; las reglas son pocas y
 * directas.
 */
export class ApiError extends Error {
  statusCode: number;
  details?: unknown;
  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function parsePositiveInt(raw: unknown, field: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ApiError(400, `${field} must be a positive integer`);
  }
  return n;
}

export function parseOptionalInt(raw: unknown, field: string): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  return parsePositiveInt(raw, field);
}

export function parseLimit(raw: unknown, def: number, max: number): number {
  if (raw === undefined || raw === null || raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ApiError(400, `limit must be a positive integer`);
  }
  return Math.min(n, max);
}

export function parseOffset(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new ApiError(400, `offset must be a non-negative integer`);
  }
  return n;
}

export function parseDate(raw: unknown, field: string): Date {
  if (typeof raw !== 'string' || !raw) {
    throw new ApiError(400, `${field} must be ISO date string`);
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new ApiError(400, `${field} invalid date: ${raw}`);
  }
  return d;
}

export function parseOptionalDate(raw: unknown, field: string): Date | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  return parseDate(raw, field);
}

export function parseEnum<T extends string>(raw: unknown, allowed: readonly T[], field: string): T {
  if (typeof raw !== 'string' || !(allowed as readonly string[]).includes(raw)) {
    throw new ApiError(400, `${field} must be one of ${allowed.join(',')}`);
  }
  return raw as T;
}

export function parseOptionalEnum<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  field: string
): T | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  return parseEnum(raw, allowed, field);
}
