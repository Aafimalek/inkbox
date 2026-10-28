import type {
  Inkbox,
  SlackApplicationRemoval,
  SlackAppDeletionStatus,
  SlackRemoveApplicationOptions,
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
// @ts-expect-error Removal always attempts deletion; there is no deletion option.
void client.slack.removeApplication("11111111-1111-4111-8111-111111111111", { ...options, deleteOldApp: false });

// @ts-expect-error Removal does not start or report new-app setup.
void result.then((value) => value.setup);
// @ts-expect-error Automatic replacement is not part of this API.
void client.slack.replaceApplication("11111111-1111-4111-8111-111111111111", options);
