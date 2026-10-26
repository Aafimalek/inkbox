//! Organization-admin prices and calling-country subscriptions.

use crate::error::Result;
use crate::http::{HttpTransport, NO_QUERY};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use uuid::Uuid;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CatalogRate {
    pub code: String,
    pub name: String,
    pub kind: String,
    pub unit: String,
    pub currency: String,
    pub published_amount: String,
    pub amount: Option<String>,
    pub pricing_state: String,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PricingResponse {
    pub prices: Vec<CatalogRate>,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CountryAgreement {
    pub id: Uuid,
    pub name: String,
    pub country_codes: Vec<String>,
    pub monthly_amount: String,
    pub currency: String,
    pub status: String,
    pub covered_through: Option<String>,
    pub cancel_at_period_end: bool,
    pub change_pending: bool,
    pub created_at: String,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CallingCountry {
    pub country_code: String,
    pub name: String,
    pub monthly_amount: String,
    pub currency: String,
    pub status: String,
    pub agreement_id: Option<Uuid>,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CallingCountriesResponse {
    pub countries: Vec<CallingCountry>,
    pub agreements: Vec<CountryAgreement>,
    pub included_country_codes: Vec<String>,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CountryQuoteLine {
    pub country_code: String,
    pub name: String,
    pub monthly_amount: String,
    pub amount_cents: i64,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CountryQuote {
    pub quote: String,
    pub expires_at: i64,
    pub monthly_amount: String,
    pub country_amount_cents: i64,
    pub invoice_total_cents: i64,
    pub amount_due_cents: i64,
    pub currency: String,
    pub renewal_at: Option<i64>,
    #[serde(default)]
    pub items: Vec<CountryQuoteLine>,
}

pub struct BillingResource {
    http: Arc<HttpTransport>,
}
impl BillingResource {
    pub fn new(http: Arc<HttpTransport>) -> Self {
        Self { http }
    }
    pub fn pricing(&self) -> Result<PricingResponse> {
        Ok(serde_json::from_value(
            self.http.get("/billing/pricing", NO_QUERY)?,
        )?)
    }
    pub fn calling_countries(&self) -> Result<CallingCountriesResponse> {
        Ok(serde_json::from_value(
            self.http.get("/billing/calling-countries", NO_QUERY)?,
        )?)
    }
    pub fn quote_country(&self, country_code: &str) -> Result<CountryQuote> {
        Ok(serde_json::from_value(self.http.post(
            "/billing/calling-countries/quote",
            Some(&json!({"country_code": country_code})),
            NO_QUERY,
        )?)?)
    }
    /// Confirm the charge, retaining request_key for any retry after an uncertain result.
    pub fn purchase_country(
        &self,
        country_code: &str,
        quote: &str,
        request_key: Uuid,
    ) -> Result<CallingCountriesResponse> {
        Ok(serde_json::from_value(self.http.post(
            "/billing/calling-countries",
            Some(&json!({
                "country_code": country_code, "quote": quote, "request_key": request_key
            })),
            NO_QUERY,
        )?)?)
    }
    pub fn quote_countries(&self, country_codes: &[&str]) -> Result<CountryQuote> {
        Ok(serde_json::from_value(self.http.post(
            "/billing/calling-countries/quote",
            Some(&json!({"country_codes": country_codes})),
            NO_QUERY,
        )?)?)
    }
    /// Pay once for the selection, retaining request_key for retries.
    pub fn purchase_countries(
        &self,
        country_codes: &[&str],
        quote: &str,
        request_key: Uuid,
    ) -> Result<CallingCountriesResponse> {
        Ok(serde_json::from_value(self.http.post(
            "/billing/calling-countries",
            Some(&json!({"country_codes": country_codes, "quote": quote, "request_key": request_key})),
            NO_QUERY,
        )?)?)
    }
    pub fn cancel_country(&self, agreement_id: Uuid) -> Result<CallingCountriesResponse> {
        Ok(serde_json::from_value(self.http.post(
            &format!("/billing/calling-countries/{agreement_id}/cancel"),
            Some(&json!({})),
            NO_QUERY,
        )?)?)
    }
    pub fn resume_country(&self, agreement_id: Uuid) -> Result<CallingCountriesResponse> {
        Ok(serde_json::from_value(self.http.post(
            &format!("/billing/calling-countries/{agreement_id}/resume"),
            Some(&json!({})),
            NO_QUERY,
        )?)?)
    }
}
