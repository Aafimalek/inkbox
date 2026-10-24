use httpmock::prelude::*;
use inkbox::Inkbox;
use serde_json::json;
use uuid::Uuid;

#[test]
fn billing_keeps_decimal_rates_and_purchase_identity() {
    let server = MockServer::start();
    let client = Inkbox::builder("synthetic")
        .base_url(server.base_url())
        .build()
        .unwrap();
    let pricing = server.mock(|when, then| {
        when.method(GET).path("/api/v1/billing/pricing");
        then.status(200).json_body(json!({"prices": [{
            "code": "call_seconds_outbound", "name": "Outbound calls", "kind": "usage",
            "unit": "second", "currency": "usd", "published_amount": "0.0005",
            "amount": null, "pricing_state": "unknown"
        }]}));
    });
    let rates = client.billing().pricing().unwrap();
    assert_eq!(rates.prices[0].published_amount, "0.0005");
    assert_eq!(rates.prices[0].amount, None);
    pricing.assert();

    let request_key = Uuid::new_v4();
    let purchase = server.mock(|when, then| {
        when.method(POST)
            .path("/api/v1/billing/calling-countries")
            .json_body(
                json!({"country_code":"FR", "quote":"signed-example", "request_key":request_key}),
            );
        then.status(202).json_body(
            json!({"countries":[], "agreements":[], "included_country_codes":["US","CA"]}),
        );
    });
    for _ in 0..2 {
        client
            .billing()
            .purchase_country("FR", "signed-example", request_key)
            .unwrap();
    }
    purchase.assert_hits(2);
}
