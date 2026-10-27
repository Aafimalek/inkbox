"""Replacement requests preserve retry identity and parse independent deletion outcomes."""
import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

import httpx
import pytest

from inkbox import Inkbox, SlackApplicationReplacement

DATA = json.loads((Path(__file__).parents[3] / "tests/fixtures/slack_replacement.json").read_text())


@pytest.mark.parametrize("delete_old_app", [False, True])
def test_replacement_wire_request_and_nested_response(delete_old_app):
    requests = []

    def handle(request):
        requests.append(request)
        return httpx.Response(202, json=DATA["response"])

    with Inkbox(api_key="synthetic-test-key", base_url="https://example.com") as client:
        client._api_http._client.close()
        client._api_http._client = httpx.Client(
            base_url="https://example.com/api/v1", transport=httpx.MockTransport(handle)
        )
        args = {"expected_application_generation": 2, "request_id": UUID(DATA["request_id"])}
        if delete_old_app:
            args["delete_old_app"] = True
        result = client.slack.replace_application(DATA["identity_id"], **args)
        assert isinstance(result, SlackApplicationReplacement)
        assert result.operation_id == UUID(DATA["request_id"])
        assert result.setup.retry_at == datetime(2026, 10, 27, 12, tzinfo=timezone.utc)
        for _ in range(2):
            client.slack.replace_application(DATA["identity_id"], **args)
        assert len(requests) == 3
        for request in requests:
            assert request.method == "POST"
            assert request.url.path == "/api/v1/slack/applications/replace"
            assert json.loads(request.content) == {
                "identity_id": DATA["identity_id"], "expected_application_generation": 2,
                "request_id": DATA["request_id"], "delete_old_app": delete_old_app,
            }


@pytest.mark.parametrize("status", ["not_requested", "pending", "deleted", "already_deleted", "failed", "unknown"])
def test_poll_keeps_deletion_outcome_separate_from_setup(status):
    requests = []

    def handle(request):
        requests.append(request)
        return httpx.Response(200, json={**DATA["response"], "deletion_status": status,
                                       "deletion_error_code": "credentials_required" if status == "failed" else None})

    with Inkbox(api_key="synthetic-test-key", base_url="https://example.com") as client:
        client._api_http._client.close()
        client._api_http._client = httpx.Client(
            base_url="https://example.com/api/v1", transport=httpx.MockTransport(handle)
        )
        result = client.slack.get_replacement(DATA["request_id"])
        assert result.deletion_status == status
        assert result.setup.status == "pending"
        assert result.deletion_error_code == ("credentials_required" if status == "failed" else None)
        assert requests[0].method == "GET"
        assert requests[0].url.path == f"/api/v1/slack/applications/replacements/{DATA['request_id']}"


def test_current_generation_and_legacy_response():
    replies = [{"connections": [], "installation_available": False, "application_generation": 3},
               {"connections": [], "installation_available": False}]
    with Inkbox(api_key="synthetic-test-key", base_url="https://example.com") as client:
        client._api_http._client.close()
        client._api_http._client = httpx.Client(base_url="https://example.com/api/v1",
            transport=httpx.MockTransport(lambda _: httpx.Response(200, json=replies.pop(0))))
        assert client.slack.list_connections(DATA["identity_id"]).application_generation == 3
        assert client.slack.list_connections(DATA["identity_id"]).application_generation is None
