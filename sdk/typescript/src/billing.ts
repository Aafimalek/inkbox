import type { HttpTransport } from "./_http.js";

export interface CatalogRate {
  code: string; name: string; kind: string; unit: string; currency: string;
  published_amount: string; amount: string | null;
  pricing_state: "published" | "priced" | "not_billed" | "unknown";
}
export interface PricingResponse { prices: CatalogRate[] }
export interface CountryAgreement {
  id: string; name: string; country_codes: string[]; monthly_amount: string; currency: string;
  status: string; covered_through: string | null; cancel_at_period_end: boolean; change_pending: boolean; created_at: string;
}
export interface CallingCountry {
  country_code: string; name: string; monthly_amount: string; currency: string; status: string; agreement_id: string | null;
}
export interface CallingCountriesResponse {
  countries: CallingCountry[]; agreements: CountryAgreement[]; included_country_codes: string[];
}
export interface CountryQuoteLine {
  country_code: string; name: string; monthly_amount: string; amount_cents: number;
}
export interface CountryQuote {
  quote: string; expires_at: number; monthly_amount: string; country_amount_cents: number;
  invoice_total_cents: number; amount_due_cents: number; currency: string; renewal_at: number | null;
  items?: CountryQuoteLine[];
}

export type BundleCode = "voip_line_bundle" | "personal_imessage_line_bundle";
export interface BundleOffer {
  code: BundleCode; name: string; line_kind: "voip" | "imessage"; monthly_amount: string; voice_seconds: number; messages: number;
}
export interface BundleAgreement {
  id: string; code: BundleCode; name: string; line_kind: "voip" | "imessage"; monthly_amount: string;
  status: string; paid_through: string | null; cancel_at_period_end: boolean; change_pending: boolean;
}
export interface LineBundlesResponse {
  offers: BundleOffer[]; agreements: BundleAgreement[]; voice_seconds_remaining: number; messages_remaining: number;
}
export interface BundleQuote {
  code: BundleCode; name: string; quote: string; expires_at: number; monthly_amount: string;
  bundle_amount_cents: number; amount_due_cents: number; invoice_total_cents: number; currency: string;
  voice_seconds: number; messages: number; period_end: string;
}

/** Organization-admin billing. Decimal amounts and response field names preserve the API representation. */
export class BillingResource {
  constructor(private readonly http: HttpTransport) {}
  pricing(): Promise<PricingResponse> { return this.http.get("/billing/pricing"); }
  callingCountries(): Promise<CallingCountriesResponse> { return this.http.get("/billing/calling-countries"); }
  quoteCountry(countryCode: string): Promise<CountryQuote> {
    return this.http.post("/billing/calling-countries/quote", { country_code: countryCode });
  }
  /** Confirm the charge; reuse requestKey after an uncertain response. */
  purchaseCountry(countryCode: string, options: { quote: string; requestKey: string }): Promise<CallingCountriesResponse> {
    return this.http.post("/billing/calling-countries", { country_code: countryCode, quote: options.quote, request_key: options.requestKey });
  }
  quoteCountries(countryCodes: string[]): Promise<CountryQuote> {
    return this.http.post("/billing/calling-countries/quote", { country_codes: countryCodes });
  }
  /** Pay once for all selected countries; retain requestKey for retries. */
  purchaseCountries(countryCodes: string[], options: { quote: string; requestKey: string }): Promise<CallingCountriesResponse> {
    return this.http.post("/billing/calling-countries", { country_codes: countryCodes, quote: options.quote, request_key: options.requestKey });
  }
  cancelCountry(agreementId: string): Promise<CallingCountriesResponse> {
    return this.http.post(`/billing/calling-countries/${encodeURIComponent(agreementId)}/cancel`, {});
  }
  resumeCountry(agreementId: string): Promise<CallingCountriesResponse> {
    return this.http.post(`/billing/calling-countries/${encodeURIComponent(agreementId)}/resume`, {});
  }
  lineBundles(): Promise<LineBundlesResponse> { return this.http.get("/billing/line-bundles"); }
  quoteLineBundle(code: BundleCode): Promise<BundleQuote> {
    return this.http.post("/billing/line-bundles/quote", { code });
  }
  /** Add capacity and prorated credits; reuse requestKey after an uncertain response. */
  purchaseLineBundle(code: BundleCode, options: { quote: string; requestKey: string }): Promise<LineBundlesResponse> {
    return this.http.post("/billing/line-bundles", { code, quote: options.quote, request_key: options.requestKey });
  }
  /** Remove an unused slot, retaining paid usage credits until expiry. */
  cancelLineBundle(agreementId: string): Promise<LineBundlesResponse> {
    return this.http.post(`/billing/line-bundles/${encodeURIComponent(agreementId)}/cancel`, {});
  }
  resumeLineBundle(agreementId: string): Promise<LineBundlesResponse> {
    return this.http.post(`/billing/line-bundles/${encodeURIComponent(agreementId)}/resume`, {});
  }
}
