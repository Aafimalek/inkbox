"""Organization-admin pricing and calling-country subscriptions."""

from typing import TYPE_CHECKING, Literal, TypedDict, cast
from uuid import UUID

if TYPE_CHECKING:
    from inkbox._http import HttpTransport


class CatalogRate(TypedDict):
    code: str
    name: str
    kind: str
    unit: str
    currency: str
    published_amount: str
    amount: str | None
    pricing_state: Literal["published", "priced", "not_billed", "unknown"]


class PricingResponse(TypedDict):
    prices: list[CatalogRate]


class CountryAgreement(TypedDict):
    id: str
    name: str
    country_codes: list[str]
    monthly_amount: str
    currency: str
    status: str
    covered_through: str | None
    cancel_at_period_end: bool
    change_pending: bool
    created_at: str


class CallingCountry(TypedDict):
    country_code: str
    name: str
    monthly_amount: str
    currency: str
    status: str
    agreement_id: str | None


class CallingCountriesResponse(TypedDict):
    countries: list[CallingCountry]
    agreements: list[CountryAgreement]
    included_country_codes: list[str]


class CountryQuote(TypedDict):
    quote: str
    expires_at: int
    monthly_amount: str
    country_amount_cents: int
    invoice_total_cents: int
    amount_due_cents: int
    currency: str
    renewal_at: int | None


class BillingResource:
    """Requires an organization-admin API key; identity-scoped keys cannot purchase."""

    def __init__(self, http: "HttpTransport") -> None:
        self._http = http

    def pricing(self) -> PricingResponse:
        return cast(PricingResponse, self._http.get("/billing/pricing"))

    def calling_countries(self) -> CallingCountriesResponse:
        return cast(CallingCountriesResponse, self._http.get("/billing/calling-countries"))

    def quote_country(self, country_code: str) -> CountryQuote:
        return cast(CountryQuote, self._http.post("/billing/calling-countries/quote", json={"country_code": country_code}))

    def purchase_country(self, country_code: str, *, quote: str, request_key: UUID | str) -> CallingCountriesResponse:
        """Confirm the quoted charge. Reuse request_key when retrying an uncertain result."""
        return cast(CallingCountriesResponse, self._http.post("/billing/calling-countries", json={
            "country_code": country_code, "quote": quote, "request_key": str(request_key),
        }))

    def quote_countries(self, country_codes: list[str]) -> CountryQuote:
        """Preview one invoice for all selected destinations."""
        return cast(CountryQuote, self._http.post("/billing/calling-countries/quote", json={"country_codes": country_codes}))

    def purchase_countries(self, country_codes: list[str], *, quote: str, request_key: UUID | str) -> CallingCountriesResponse:
        """Pay once for the selection; reuse request_key after an uncertain response."""
        return cast(CallingCountriesResponse, self._http.post("/billing/calling-countries", json={
            "country_codes": country_codes, "quote": quote, "request_key": str(request_key),
        }))

    def cancel_country(self, agreement_id: UUID | str) -> CallingCountriesResponse:
        """Stop renewal while retaining access through the paid-through date."""
        return cast(CallingCountriesResponse, self._http.post(f"/billing/calling-countries/{UUID(str(agreement_id))}/cancel", json={}))

    def resume_country(self, agreement_id: UUID | str) -> CallingCountriesResponse:
        return cast(CallingCountriesResponse, self._http.post(f"/billing/calling-countries/{UUID(str(agreement_id))}/resume", json={}))
