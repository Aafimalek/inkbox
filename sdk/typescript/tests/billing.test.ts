import { afterEach, expect, it, vi } from "vitest";
import { Inkbox } from "../src/inkbox.js";

afterEach(() => vi.unstubAllGlobals());

it("keeps decimal and unknown prices and sends the same purchase identity", async () => {
  const payload = { prices: [{ code: "calls", amount: "0.0005", published_amount: "0.0005", pricing_state: "priced" },
    { code: "sms", amount: null, pricing_state: "unknown" }] };
  const fetch = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  const client = new Inkbox({ apiKey: "synthetic-test-key" });
  expect(await client.billing.pricing()).toEqual(payload);
  const options = { quote: "accepted-quote", requestKey: "a3f22fcb-d805-4811-830c-2c61c3da5316" };
  await client.billing.purchaseCountry("FR", options);
  await client.billing.purchaseCountry("FR", options);
  const requests = fetch.mock.calls as unknown as [string, RequestInit][];
  expect(requests[1][0]).toBe("https://inkbox.ai/api/v1/billing/calling-countries");
  expect(JSON.parse(String(requests[1][1].body))).toEqual({ country_code: "FR", quote: options.quote, request_key: options.requestKey });
  expect(requests[1][1].body).toBe(requests[2][1].body);
});
