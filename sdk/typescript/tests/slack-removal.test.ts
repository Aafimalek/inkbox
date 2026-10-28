import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { Inkbox, type SlackApplicationRemoval } from "../src/index.js";

const data = JSON.parse(readFileSync(new URL("../../../tests/fixtures/slack_removal.json", import.meta.url), "utf8"));
afterEach(() => vi.unstubAllGlobals());

it("sends the three-field removal request without creating another app", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal("fetch", fetch);
  const client = new Inkbox({ apiKey: "synthetic-test-key", baseUrl: "https://example.com" });
  const options = { expectedApplicationGeneration: 2, requestId: data.request_id };
  for (let attempt = 0; attempt < 2; attempt++) {
    fetch.mockResolvedValueOnce(new Response(JSON.stringify(data.response), { status: 202 }));
    const result: SlackApplicationRemoval = await client.slack.removeApplication(data.identity_id, options);
    expect(result.operationId).toBe(data.request_id);
    expect(result.status).toBe("removed");
    expect(result).not.toHaveProperty("setup");
    expect(result.deletionStatus).toBe("pending");
  }
  expect(fetch).toHaveBeenCalledTimes(2);
  for (const [url, request] of fetch.mock.calls) {
    expect(new URL(String(url)).pathname).toBe("/api/v1/slack/applications/remove");
    expect(request?.method).toBe("POST");
    expect(JSON.parse(String(request?.body))).toEqual({ identity_id: data.identity_id,
      expected_application_generation: 2, request_id: data.request_id });
  }
});

it.each(["not_requested", "pending", "deleted", "already_deleted", "failed", "unknown"])("polls deletion outcome %s independently", async (status) => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal("fetch", fetch);
  fetch.mockResolvedValueOnce(new Response(JSON.stringify({ ...data.response, deletion_status: status,
    deletion_error_code: status === "failed" ? "credentials_required" : null })));
  const client = new Inkbox({ apiKey: "synthetic-test-key", baseUrl: "https://example.com" });
  const result = await client.slack.getApplicationRemoval(data.request_id);
  expect(result.deletionStatus).toBe(status);
  expect(result.deletionErrorCode).toBe(status === "failed" ? "credentials_required" : null);
  expect(result.status).toBe("removed");
  expect(result).not.toHaveProperty("setup");
  expect(new URL(String(fetch.mock.calls[0][0])).pathname).toBe(`/api/v1/slack/applications/removals/${data.request_id}`);
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

it("starts fresh setup only as a separate caller-selected workspace action", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal("fetch", fetch);
  const client = new Inkbox({ apiKey: "synthetic-test-key", baseUrl: "https://example.com" });
  fetch.mockResolvedValueOnce(new Response(JSON.stringify(data.response), { status: 202 }));
  const removed = await client.slack.removeApplication(data.identity_id, {
    expectedApplicationGeneration: 2, requestId: data.request_id,
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockResolvedValueOnce(new Response(JSON.stringify(data.detached)));
  const current = await client.slack.listConnections(data.identity_id);
  expect(current.setup?.status).toBe("needs_credentials");
  expect(current.setup?.provisioningWorkspaceId).toBeNull();
  expect(current.applicationCreated).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(2);
  fetch.mockResolvedValueOnce(new Response(JSON.stringify({ status: "pending" }), { status: 202 }));
  await client.slack.startSetup(data.identity_id, data.fresh_provisioning_workspace_id);
  expect(new URL(String(fetch.mock.calls[2][0])).pathname).toBe("/api/v1/slack/applications/setup");
  expect(JSON.parse(String(fetch.mock.calls[2][1]?.body))).toEqual({
    identity_id: data.identity_id, provisioning_workspace_id: data.fresh_provisioning_workspace_id,
  });
  fetch.mockResolvedValueOnce(new Response(JSON.stringify(data.response)));
  expect(await client.slack.getApplicationRemoval(removed.operationId)).toEqual({
    operationId: data.request_id, status: "removed", deletionStatus: "pending", deletionErrorCode: null,
  });
  expect(fetch).toHaveBeenCalledTimes(4);
});

it("rejects unknown removal options before making a request", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal("fetch", fetch);
  const client = new Inkbox({ apiKey: "synthetic-test-key", baseUrl: "https://example.com" });
  for (const extraOption of [false, true, undefined]) {
    await expect(client.slack.removeApplication(data.identity_id, {
      expectedApplicationGeneration: 2, requestId: data.request_id, extraOption,
    } as never)).rejects.toThrow(/expectedApplicationGeneration and requestId only/);
  }
  expect(fetch).not.toHaveBeenCalled();
});
