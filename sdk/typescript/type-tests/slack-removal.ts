import type {
  Inkbox,
  SlackApplicationRemoval,
  SlackAppDeletionStatus,
  SlackRemoveApplicationOptions,
  SlackProvisioningWorkspace,
} from "../dist/index.js";

declare const client: Inkbox;
const options: SlackRemoveApplicationOptions = {
  expectedApplicationGeneration: 1,
  requestId: "33333333-3333-4333-8333-333333333333",
};
const result: Promise<SlackApplicationRemoval> = client.slack.removeApplication(
  "11111111-1111-4111-8111-111111111111", options,
);
const polled: Promise<SlackApplicationRemoval> = client.slack.getApplicationRemoval(options.requestId);
const status: SlackAppDeletionStatus = "already_deleted";
void result;
void polled;
void status;
// @ts-expect-error Removal requires a current generation and stable request ID.
void client.slack.removeApplication("11111111-1111-4111-8111-111111111111", {});
// @ts-expect-error Only current removal options are accepted.
void client.slack.removeApplication("11111111-1111-4111-8111-111111111111", { ...options, extraOption: false });

// @ts-expect-error Removal does not start or report new-app setup.
void result.then((value) => value.setup);

// Older callers can still construct metadata without a cached account name.
const legacyWorkspace: SlackProvisioningWorkspace = {
  id: "44444444-4444-4444-8444-444444444444", workspaceId: "TEXAMPLE",
  workspaceName: "Example", userId: "UEXAMPLE", status: "ready",
  tokenExpiresAt: null, createdAt: new Date(), updatedAt: new Date(),
};
const namedWorkspace: SlackProvisioningWorkspace = { ...legacyWorkspace, userName: "example-owner" };
void namedWorkspace;
