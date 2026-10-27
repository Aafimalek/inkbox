import type {
  Inkbox,
  SlackApplicationReplacement,
  SlackAppDeletionStatus,
  SlackReplaceApplicationOptions,
} from "../dist/index.js";

declare const client: Inkbox;
const options: SlackReplaceApplicationOptions = {
  expectedApplicationGeneration: 1,
  requestId: "33333333-3333-4333-8333-333333333333",
};
const result: Promise<SlackApplicationReplacement> = client.slack.replaceApplication(
  "11111111-1111-4111-8111-111111111111", options,
);
const polled: Promise<SlackApplicationReplacement> = client.slack.getReplacement(options.requestId);
const status: SlackAppDeletionStatus = "already_deleted";
void result;
void polled;
void status;
// @ts-expect-error Replacement requires a current generation and stable request ID.
void client.slack.replaceApplication("11111111-1111-4111-8111-111111111111", {});
// @ts-expect-error Deletion must be an explicit boolean, not a truthy string.
void client.slack.replaceApplication("11111111-1111-4111-8111-111111111111", { ...options, deleteOldApp: "true" });
