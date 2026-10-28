"""Removal requests preserve retry identity and parse independent deletion outcomes."""
import json
from pathlib import Path
from uuid import UUID

import httpx
import pytest

from inkbox import Inkbox, SlackApplicationRemoval

DATA = json.loads((Path(__file__).parents[3] / "tests/fixtures/slack_removal.json").read_text())


@pytest.mark.parametrize("delete_old_app", [False, True])
def test_removal_wire_request_does_not_create_another_app(delete_old_app):
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
        result = client.slack.remove_application(DATA["identity_id"], **args)
        assert isinstance(result, SlackApplicationRemoval)
        assert result.operation_id == UUID(DATA["request_id"])
        assert result.status == "removed"
        assert not hasattr(result, "setup")
        for _ in range(2):
            client.slack.remove_application(DATA["identity_id"], **args)
        assert len(requests) == 3
        for request in requests:
            assert request.method == "POST"
            assert request.url.path == "/api/v1/slack/applications/remove"
            assert json.loads(request.content) == {
                "identity_id": DATA["identity_id"], "expected_application_generation": 2,
                "request_id": DATA["request_id"], "delete_old_app": delete_old_app,
            }


@pytest.mark.parametrize("status", ["not_requested", "pending", "deleted", "already_deleted", "failed", "unknown"])
def test_poll_keeps_removed_status_separate_from_optional_deletion(status):
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
        result = client.slack.get_application_removal(DATA["request_id"])
        assert result.deletion_status == status
        assert result.status == "removed"
        assert not hasattr(result, "setup")
        assert result.deletion_error_code == ("credentials_required" if status == "failed" else None)
        assert requests[0].method == "GET"
        assert requests[0].url.path == f"/api/v1/slack/applications/removals/{DATA['request_id']}"


def test_current_generation_and_legacy_response():
    replies = [{"connections": [], "installation_available": False, "application_generation": 3},
               {"connections": [], "installation_available": False}]
    with Inkbox(api_key="synthetic-test-key", base_url="https://example.com") as client:
        client._api_http._client.close()
        client._api_http._client = httpx.Client(base_url="https://example.com/api/v1",
            transport=httpx.MockTransport(lambda _: httpx.Response(200, json=replies.pop(0))))
        assert client.slack.list_connections(DATA["identity_id"]).application_generation == 3
        assert client.slack.list_connections(DATA["identity_id"]).application_generation is None


def test_unpublished_replacement_methods_are_not_exposed():
    with Inkbox(api_key="synthetic-test-key", base_url="https://example.com") as client:
        assert not hasattr(client.slack, "replace_application")
        assert not hasattr(client.slack, "get_replacement")


def test_fresh_setup_is_an_explicit_separate_choice():
    requests = []
    replies = [DATA["response"], DATA["detached"], {"status": "pending"}, DATA["response"]]

    def handle(request):
        requests.append(request)
        return httpx.Response(200, json=replies.pop(0))

    with Inkbox(api_key="synthetic-test-key", base_url="https://example.com") as client:
        client._api_http._client.close()
        client._api_http._client = httpx.Client(
            base_url="https://example.com/api/v1", transport=httpx.MockTransport(handle)
        )
        removed = client.slack.remove_application(DATA["identity_id"],
            expected_application_generation=2, request_id=DATA["request_id"])
        assert len(requests) == 1
        current = client.slack.list_connections(DATA["identity_id"])
        assert current.setup.status == "needs_credentials"
        assert current.setup.provisioning_workspace_id is None
        assert not current.application_created
        assert len(requests) == 2
        client.slack.start_setup(DATA["identity_id"], DATA["fresh_provisioning_workspace_id"])
        assert requests[2].url.path == "/api/v1/slack/applications/setup"
        assert json.loads(requests[2].content) == {
            "identity_id": DATA["identity_id"],
            "provisioning_workspace_id": DATA["fresh_provisioning_workspace_id"],
        }
        polled = client.slack.get_application_removal(removed.operation_id)
        assert polled.status == "removed"
        assert not hasattr(polled, "setup")
        assert len(requests) == 4
