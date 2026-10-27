import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { Inkbox, type SlackApplicationReplacement } from "../src/index.js";

const data = JSON.parse(readFileSync(new URL("../../../tests/fixtures/slack_replacement.json", import.meta.url), "utf8"));
afterEach(() => vi.unstubAllGlobals());

it.each([false, true])("sends exact replacement and retry arguments (delete=%s)", async (deleteOldApp) => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal("fetch", fetch);
  const client = new Inkbox({ apiKey: "synthetic-test-key", baseUrl: "https://example.com" });
  const options = { expectedApplicationGeneration: 2, requestId: data.request_id,
    ...(deleteOldApp ? { deleteOldApp: true } : {}) };
  for (let attempt = 0; attempt < 2; attempt++) {
    fetch.mockResolvedValueOnce(new Response(JSON.stringify(data.response), { status: 202 }));
    const result: SlackApplicationReplacement = await client.slack.replaceApplication(data.identity_id, options);
    expect(result.operationId).toBe(data.request_id);
    expect(result.setup.retryAt).toEqual(new Date(data.response.setup.retry_at));
    expect(result.deletionStatus).toBe("not_requested");
  }
  expect(fetch).toHaveBeenCalledTimes(2);
  for (const [url, request] of fetch.mock.calls) {
    expect(new URL(String(url)).pathname).toBe("/api/v1/slack/applications/replace");
    expect(request?.method).toBe("POST");
    expect(JSON.parse(String(request?.body))).toEqual({ identity_id: data.identity_id,
      expected_application_generation: 2, request_id: data.request_id, delete_old_app: deleteOldApp });
  }
});

it.each(["not_requested", "pending", "deleted", "already_deleted", "failed", "unknown"])("polls deletion outcome %s independently", async (status) => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal("fetch", fetch);
  fetch.mockResolvedValueOnce(new Response(JSON.stringify({ ...data.response, deletion_status: status,
    deletion_error_code: status === "failed" ? "credentials_required" : null })));
  const client = new Inkbox({ apiKey: "synthetic-test-key", baseUrl: "https://example.com" });
  const result = await client.slack.getReplacement(data.request_id);
  expect(result.deletionStatus).toBe(status);
  expect(result.deletionErrorCode).toBe(status === "failed" ? "credentials_required" : null);
  expect(result.setup.status).toBe("pending");
  expect(new URL(String(fetch.mock.calls[0][0])).pathname).toBe(`/api/v1/slack/applications/replacements/${data.request_id}`);
  expect(fetch.mock.calls[0][1]?.method).toBe("GET");
});

it("parses application generation and tolerates legacy responses", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal("fetch", fetch);
  const client = new Inkbox({ apiKey: "synthetic-test-key", baseUrl: "https://example.com" });
  fetch.mockResolvedValueOnce(new Response(JSON.stringify({ connections: [], installation_available: false, application_generation: 3 })));
  expect((await client.slack.listConnections(data.identity_id)).applicationGeneration).toBe(3);
  fetch.mockResolvedValueOnce(new Response(JSON.stringify({ connections: [], installation_available: false })));
  expect((await client.slack.listConnections(data.identity_id)).applicationGeneration).toBeNull();
});
