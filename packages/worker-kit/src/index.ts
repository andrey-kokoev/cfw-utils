import type { ZodTypeAny, infer as ZodInfer } from "zod";
import { ApiErrorSchema } from "@cfw-utils/schemas";

export function json(value: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(value, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
    ...init,
  });
}

export function apiError(status: number, error: string, code?: string): Response {
  const body = ApiErrorSchema.parse({ error, ...(code ? { code } : {}) });
  return json(body, { status });
}

export function ok<T>(data: T) {
  return { ok: true as const, data };
}

export function err(error: { error: string; code?: string }) {
  return { ok: false as const, error: ApiErrorSchema.parse(error) };
}

export async function parseJson<T>(
  request: Request,
  guard: (value: unknown) => value is T,
): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: apiError(400, "Invalid JSON") };
  }

  if (!guard(body)) {
    return { ok: false, response: apiError(400, "Invalid request body") };
  }

  return { ok: true, value: body };
}

export async function parseJsonWithSchema<TSchema extends ZodTypeAny>(
  request: Request,
  schema: TSchema,
): Promise<
  { ok: true; value: ZodInfer<TSchema> } | { ok: false; response: Response; issues?: unknown }
> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: apiError(400, "Invalid JSON") };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const message =
      parsed.error.issues[0]?.message && typeof parsed.error.issues[0]?.message === "string"
        ? parsed.error.issues[0].message
        : "Invalid request body";
    return {
      ok: false,
      response: apiError(400, message, "VALIDATION_ERROR"),
      issues: parsed.error.issues,
    };
  }

  return { ok: true, value: parsed.data as ZodInfer<TSchema> };
}

export function createSchemaHandler<
  TReqSchema extends ZodTypeAny,
  TResSchema extends ZodTypeAny,
  TEnv = unknown,
>(options: {
  method: string;
  req: TReqSchema;
  res: TResSchema;
  impl: (
    value: ZodInfer<TReqSchema>,
    request: Request,
    env: TEnv,
  ) =>
    | Promise<ZodInfer<TResSchema> | Response>
    | ZodInfer<TResSchema>
    | Response;
}): (request: Request, env: TEnv) => Promise<Response> {
  const methodUpper = options.method.toUpperCase();
  return async (request: Request, env: TEnv): Promise<Response> => {
    if (request.method.toUpperCase() !== methodUpper) {
      return json(err({ error: "Method Not Allowed", code: "METHOD_NOT_ALLOWED" }), { status: 405 });
    }

    const parsed = await parseJsonWithSchema(request, options.req);
    if (!parsed.ok) {
      // `parseJsonWithSchema` already produces ApiError body.
      const body = await parsed.response.json().catch(() => null);
      const apiErr = ApiErrorSchema.safeParse(body);
      const message = apiErr.success ? apiErr.data.error : "Invalid request body";
      return json(err({ error: message, code: "VALIDATION_ERROR" }), { status: 400 });
    }

    try {
      const output = await options.impl(parsed.value, request, env);
      if (output instanceof Response) return output;
      const validated = options.res.safeParse(output);
      if (!validated.success) {
        return json(err({ error: "Invalid server response", code: "INVALID_RESPONSE" }), { status: 500 });
      }
      return json(ok(validated.data));
    } catch (error) {
      if (error instanceof Response) return error;
      return json(err({ error: "Internal Error", code: "INTERNAL_ERROR" }), { status: 500 });
    }
  };
}
