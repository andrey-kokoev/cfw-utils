import type { ApiError } from "@cfw-utils/schemas";

export type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err(error: ApiError): Result<never> {
  return { ok: false, error };
}

export function mapResult<TIn, TOut>(result: Result<TIn>, fn: (value: TIn) => TOut): Result<TOut> {
  return result.ok ? ok(fn(result.data)) : result;
}

export async function andThenResult<TIn, TOut>(
  result: Result<TIn>,
  fn: (value: TIn) => Promise<Result<TOut>> | Result<TOut>,
): Promise<Result<TOut>> {
  return result.ok ? await fn(result.data) : result;
}

export function mapError<T>(result: Result<T>, fn: (error: ApiError) => ApiError): Result<T> {
  return result.ok ? result : { ok: false, error: fn(result.error) };
}

export function withCode(error: ApiError, code: string): ApiError {
  return { ...error, code: error.code ?? code };
}

