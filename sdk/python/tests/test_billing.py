from unittest.mock import MagicMock
from uuid import UUID

from inkbox.billing import BillingResource


def test_decimal_prices_and_retry_identity_are_preserved():
    http = MagicMock()
    resource = BillingResource(http)
    http.get.return_value = {"prices": [{"amount": "0.0005"}, {"amount": None}]}
    assert resource.pricing()["prices"] == [{"amount": "0.0005"}, {"amount": None}]
    key = UUID("a3f22fcb-d805-4811-830c-2c61c3da5316")
    for _ in range(2):
        resource.purchase_country("FR", quote="accepted", request_key=key)
    assert http.post.call_args_list[0] == http.post.call_args_list[1]
    assert http.post.call_args.kwargs["json"] == {"country_code": "FR", "quote": "accepted", "request_key": str(key)}


def test_cancel_and_resume_use_the_existing_agreement():
    http = MagicMock()
    resource = BillingResource(http)
    identifier = UUID("a3f22fcb-d805-4811-830c-2c61c3da5316")
    resource.cancel_country(identifier)
    assert http.post.call_args.args == (f"/billing/calling-countries/{identifier}/cancel",)
    resource.resume_country(identifier)
    assert http.post.call_args.args == (f"/billing/calling-countries/{identifier}/resume",)
