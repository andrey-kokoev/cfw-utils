import { createSchemaHandler, err, json } from "@cfw-utils/worker-kit";
import {
  DocxConversionProcessRequestSchema,
  DocxConversionProcessResponseSchema,
  HealthResponseSchema,
  type DocxConversionProcessRequest,
  type HealthResponse,
} from "@cfw-utils/schemas";
import type { MessageBatch } from "@cloudflare/workers-types";

const DOCS_TABLE = "documents";

type Env = {
  DB: D1Database;
  BLOB: R2Bucket;
};

async function processMessage(value: DocxConversionProcessRequest, env: Env) {
  const { documentId, storageKey, filename, conversionUrl, conversionToken } = value;

  const existing = await env.DB.prepare(`SELECT id FROM ${DOCS_TABLE} WHERE id = ?`).bind(documentId).first();
  if (!existing) return;

  const endpoint = new URL(conversionUrl);
  endpoint.pathname = endpoint.pathname.replace(/\/$/, "") + "/convert-json";

  const object = await env.BLOB.get(storageKey);
  if (!object) {
    throw new Error("Document file not found in storage");
  }

  const buffer = await object.arrayBuffer();
  const form = new FormData();
  const blob = new Blob([buffer]);
  form.append("file", blob, filename || `document-${documentId}.docx`);

  const response = await fetch(endpoint.toString(), {
    method: "POST",
    headers: conversionToken ? { Authorization: `Bearer ${conversionToken}` } : undefined,
    body: form,
  });

  if (!response.ok) {
    throw new Error(`Conversion failed (HTTP ${response.status})`);
  }

  const payload = (await response.json()) as { markdown?: string };
  const markdown = payload?.markdown || "";
  if (!markdown.trim()) {
    throw new Error("Conversion service returned empty content");
  }

  await env.DB.prepare(
    `UPDATE ${DOCS_TABLE} SET content = ?, status = ?, updatedAt = ? WHERE id = ?`,
  )
    .bind(markdown, "uploaded", Math.floor(Date.now() / 1000), documentId)
    .run();
}

const run = createSchemaHandler({
  method: "POST",
  req: DocxConversionProcessRequestSchema,
  res: DocxConversionProcessResponseSchema,
  async impl(value, _request, env: Env) {
    await processMessage(value, env);
    return { processed: true };
  },
});

export default {
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const body = message.body as DocxConversionProcessRequest;
      if (!body?.documentId || !body?.storageKey) {
        message.ack();
        continue;
      }
      try {
        await processMessage(body, env);
      } catch (error) {
        await env.DB.prepare(
          `UPDATE ${DOCS_TABLE} SET status = ?, updatedAt = ? WHERE id = ?`,
        )
          .bind("error", Math.floor(Date.now() / 1000), body.documentId)
          .run();
      } finally {
        message.ack();
      }
    }
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      const health: HealthResponse = { ok: true, service: "docx-conversion-consumer" };
      return json(HealthResponseSchema.parse(health));
    }
    if (request.method !== "POST" || url.pathname !== "/run") {
      return json(err({ error: "Not Found", code: "NOT_FOUND" }), { status: 404 });
    }
    return run(request, env);
  },
};
