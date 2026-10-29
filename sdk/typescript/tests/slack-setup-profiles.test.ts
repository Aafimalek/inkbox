import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { Inkbox, type SlackActorProfile, type SlackWebhookPayload } from "../src/index.js";
import { parseContact } from "../src/contacts/types.js";
const data = JSON.parse(readFileSync(new URL("../../../tests/fixtures/slack_setup_profiles.json", import.meta.url), "utf8"));
afterEach(() => vi.unstubAllGlobals());
it("starts setup once and parses nested dates while tolerating legacy responses", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal("fetch", fetch);
  const client = new Inkbox({ apiKey: "synthetic-test-key", baseUrl: "https://example.com" });
  fetch.mockResolvedValueOnce(new Response(JSON.stringify(data.setup), { status: 202 }));
  const setup = await client.slack.startSetup(data.identity_id, data.provisioning_workspace_id);
  expect(setup).toEqual({ status: "pending", retryAt: new Date(data.setup.retry_at), errorCode: null, provisioningWorkspaceId: data.provisioning_workspace_id });
  expect(new URL(String(fetch.mock.calls[0][0])).pathname).toBe("/api/v1/slack/applications/setup");
  expect(fetch.mock.calls[0][1]?.method).toBe("POST");
  expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({ identity_id: data.identity_id, provisioning_workspace_id: data.provisioning_workspace_id });
  fetch.mockResolvedValueOnce(new Response(JSON.stringify({ connections: [], installation_available: true, setup: data.setup, application_created: true })));
  const current = await client.slack.listConnections(data.identity_id);
  expect(current.setup).toEqual(setup);
  expect(current.applicationCreated).toBe(true);
  fetch.mockResolvedValueOnce(new Response(JSON.stringify({ connections: [], installation_available: true })));
  const old = await client.slack.listConnections(data.identity_id);
  expect(old.setup).toBeNull();
  expect(old.applicationCreated).toBe(false);
});
it("parses linked Slack accounts without changing existing contact identifiers", () => {
  expect(parseContact(data.contact).slackAccounts).toEqual([
    { workspaceId: "TEXAMPLE", userId: "UEXAMPLE", workspaceName: "Example workspace" },
    { workspaceId: "TSECOND", userId: "USECOND", workspaceName: null },
  ]);
  expect(parseContact({ ...data.contact, slack_accounts: undefined }).slackAccounts).toEqual([]);
});
it("keeps sender enrichment optional and in the webhook's wire shape", () => {
  const minimal: SlackActorProfile = { id: "UEXAMPLE" };
  const payload: SlackWebhookPayload = data.webhook;
  expect(minimal.id).toBe(payload.data.actor_id);
  expect(payload.data.actor_profile?.profile?.email).toBe("person@example.com");
  expect(payload.data.actor_profile?.is_bot).toBe(false);
  expect(payload.data.actor_profile?.tz_offset).toBe(0);
  expect(payload.data.contact_id).toBe(data.contact.id);
});

it("reports missing credentials with no selected workspace", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
    connections: [], installation_available: false,
    setup: { status: "needs_credentials", error_code: "credentials_required", provisioning_workspace_id: null },
    provisioning_workspace: null,
  }))));
  const result = await new Inkbox({ apiKey: "synthetic-test-key", baseUrl: "https://example.com" }).slack.listConnections(data.identity_id);
  expect(result.setup).toMatchObject({ status: "needs_credentials", errorCode: "credentials_required", provisioningWorkspaceId: null });
  expect(result.provisioningWorkspace).toBeNull();
});


it.each([{}, { user_name: null }, { user_name: "first-owner" }])("preserves creator-scoped grants with optional account names %j", async (nameFields) => {
  const fixture = JSON.parse(readFileSync(new URL("../../../tests/fixtures/slack.json", import.meta.url), "utf8"));
  const first = { ...fixture.provisioning_workspace };
  delete first.user_name;
  Object.assign(first, nameFields);
  const second = { ...fixture.provisioning_workspace, id: "55555555-5555-4555-8555-555555555555", user_id: "USECOND", user_name: "second-owner" };
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal("fetch", fetch);
  const client = new Inkbox({ apiKey: "synthetic-test-key", baseUrl: "https://example.com" });
  fetch.mockResolvedValueOnce(new Response(JSON.stringify({ workspaces: [first, second] })));
  const rows = await client.slack.listProvisioningWorkspaces();
  expect(rows).toHaveLength(2);
  expect(rows[0].workspaceId).toBe(rows[1].workspaceId);
  expect(rows[0].id).not.toBe(rows[1].id);
  expect(rows[0].userId).not.toBe(rows[1].userId);
  expect(rows[0].userName).toBe(first.user_name ?? null);
  expect(rows[1].userName).toBe("second-owner");
  fetch.mockResolvedValueOnce(new Response(JSON.stringify(first)));
  expect((await client.slack.saveProvisioningWorkspace({ accessToken: "synthetic-access", refreshToken: "synthetic-refresh" })).userName).toBe(first.user_name ?? null);
  expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toEqual({ access_token: "synthetic-access", refresh_token: "synthetic-refresh" });
  fetch.mockResolvedValueOnce(new Response(JSON.stringify({ connections: [], installation_available: false, provisioning_workspace: first })));
  expect((await client.slack.listConnections(data.identity_id)).provisioningWorkspace?.userName).toBe(first.user_name ?? null);
});
