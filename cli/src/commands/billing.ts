import { Command } from "commander";
import { createClient, getGlobalOpts } from "../client.js";
import { output } from "../output.js";
import { withErrorHandler } from "../errors.js";

export function registerBillingCommands(program: Command): void {
  const billing = program.command("billing").description("Organization-admin pricing and calling destinations");
  billing.command("pricing").description("Read published and contracted usage rates").action(withErrorHandler(async function (this: Command) {
    output(await createClient(getGlobalOpts(this)).billing.pricing() as unknown as Record<string, unknown>, { json: true });
  }));
  const countries = billing.command("countries").description("Manage calling-country subscriptions");
  countries.command("list").action(withErrorHandler(async function (this: Command) {
    output(await createClient(getGlobalOpts(this)).billing.callingCountries() as unknown as Record<string, unknown>, { json: true });
  }));
  countries.command("quote <country-code>").description("Preview the entire immediate invoice before paying").action(withErrorHandler(async function (this: Command, country: string) {
    output(await createClient(getGlobalOpts(this)).billing.quoteCountry(country) as unknown as Record<string, unknown>, { json: true });
  }));
  countries.command("purchase <country-code>").description("Pay the accepted quote; reuse the request key when retrying")
    .requiredOption("--quote <quote>", "Signed quote from countries quote")
    .requiredOption("--request-key <uuid>", "Stable UUID for this purchase and every retry")
    .requiredOption("--confirm", "Confirm the displayed invoice charge")
    .action(withErrorHandler(async function (this: Command, country: string, options: { quote: string; requestKey: string }) {
      output(await createClient(getGlobalOpts(this)).billing.purchaseCountry(country, options) as unknown as Record<string, unknown>, { json: true });
    }));
  countries.command("quote-many <country-codes...>").description("Preview one invoice for several countries")
    .action(withErrorHandler(async function (this: Command, codes: string[]) {
      output(await createClient(getGlobalOpts(this)).billing.quoteCountries(codes) as unknown as Record<string, unknown>, { json: true });
    }));
  countries.command("purchase-many <country-codes...>").description("Pay once for the quoted country selection")
    .requiredOption("--quote <quote>", "Signed quote from countries quote-many")
    .requiredOption("--request-key <uuid>", "Stable UUID for this purchase and every retry")
    .requiredOption("--confirm", "Confirm the displayed invoice charge")
    .action(withErrorHandler(async function (this: Command, codes: string[], options: { quote: string; requestKey: string }) {
      output(await createClient(getGlobalOpts(this)).billing.purchaseCountries(codes, options) as unknown as Record<string, unknown>, { json: true });
    }));
  countries.command("cancel <agreement-id>").description("Stop renewal; retain the already paid period").action(withErrorHandler(async function (this: Command, id: string) {
    output(await createClient(getGlobalOpts(this)).billing.cancelCountry(id) as unknown as Record<string, unknown>, { json: true });
  }));
  countries.command("resume <agreement-id>").description("Resume at the existing price before coverage expires").action(withErrorHandler(async function (this: Command, id: string) {
    output(await createClient(getGlobalOpts(this)).billing.resumeCountry(id) as unknown as Record<string, unknown>, { json: true });
  }));
}
