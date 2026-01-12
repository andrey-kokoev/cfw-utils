import type { ZodTypeAny, infer as ZodInfer } from "zod";
import { ApiErrorSchema, ResultSchema } from "@cfw-utils/schemas";
import type { ApiError } from "@cfw-utils/schemas";

export type ServiceFetcher = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

async function readBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("Content-Type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return (await response.json()) as unknown;
    } catch {
      // fall through
    }
  }
  try {
    return await response.text();
  } catch {
    return null;
  }
}

export function createSchemaClient<TReqSchema extends ZodTypeAny, TResSchema extends ZodTypeAny>(options: {
  fetcher: ServiceFetcher;
  url: string;
  method: string;
  req: TReqSchema;
  res: TResSchema;
}): (request: ZodInfer<TReqSchema>) => Promise<
  { ok: true; data: ZodInfer<TResSchema> } | { ok: false; error: ApiError }
> {
  const methodUpper = options.method.toUpperCase();
  const resultSchema = ResultSchema(options.res);
  return async (
    request: ZodInfer<TReqSchema>,
  ): Promise<{ ok: true; data: ZodInfer<TResSchema> } | { ok: false; error: ApiError }> => {
    const reqParsed = options.req.safeParse(request);
    if (!reqParsed.success) {
      return { ok: false, error: { error: "Invalid request", code: "VALIDATION_ERROR" } };
    }

    const response = await options.fetcher.fetch(options.url, {
      method: methodUpper,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(reqParsed.data),
    });

    const body = await readBody(response);
    const parsedResult = resultSchema.safeParse(body);
    if (parsedResult.success) {
      return parsedResult.data as
        | { ok: true; data: ZodInfer<TResSchema> }
        | { ok: false; error: ApiError };
    }

    if (!response.ok) {
      const apiError = ApiErrorSchema.safeParse(body);
      return { ok: false, error: apiError.success ? apiError.data : { error: "Service request failed" } };
    }

    return { ok: false, error: { error: "Invalid service response", code: "INVALID_RESPONSE" } };
  };
}
