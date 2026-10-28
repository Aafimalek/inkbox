"""Additive setup, sender, and linked-account contracts with synthetic data."""
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import NotRequired, get_origin, get_type_hints

import httpx
import pytest

from inkbox import ContactSlackAccount, Inkbox, SlackActorProfile, SlackSetupStatus, SlackWebhookData
from inkbox.contacts.types import Contact

DATA = json.loads((Path(__file__).parents[3] / "tests/fixtures/slack_setup_profiles.json").read_text())


def test_setup_request_and_nested_connection_state():
    requests = []
    replies = [DATA["setup"], {"connections": [], "installation_available": True, "setup": DATA["setup"], "application_created": True},
               {"connections": [], "installation_available": True}]
    def handle(request):
        requests.append(request)
        return httpx.Response(202 if request.method == "POST" else 200, json=replies.pop(0))
    with Inkbox(api_key="synthetic-test-key", base_url="https://example.com") as client:
        client._api_http._client.close()
        client._api_http._client = httpx.Client(base_url="https://example.com/api/v1", transport=httpx.MockTransport(handle))
        setup = client.slack.start_setup(DATA["identity_id"], DATA["provisioning_workspace_id"])
        assert isinstance(setup, SlackSetupStatus)
        assert setup.retry_at == datetime(2026, 10, 1, 12, tzinfo=timezone.utc)
        assert requests[0].method == "POST"
        assert requests[0].url.path == "/api/v1/slack/applications/setup"
        assert json.loads(requests[0].content) == {"identity_id": DATA["identity_id"], "provisioning_workspace_id": DATA["provisioning_workspace_id"]}
        current = client.slack.list_connections(DATA["identity_id"])
        assert current.setup == setup
        assert current.application_created is True
        old = client.slack.list_connections(DATA["identity_id"])
        assert old.setup is None
        assert old.application_created is False


def test_contacts_parse_linked_workspaces_and_old_responses():
    card = Contact._from_dict(DATA["contact"])
    assert isinstance(card.slack_accounts[0], ContactSlackAccount)
    assert card.slack_accounts[0].workspace_name == "Example workspace"
    assert card.slack_accounts[1].workspace_name is None
    assert card.slack_accounts[1].user_id == "USECOND"
    old = {key: value for key, value in DATA["contact"].items() if key != "slack_accounts"}
    assert Contact._from_dict(old).slack_accounts == []
    assert Contact._from_dict({**old, "slack_accounts": None}).slack_accounts == []


def test_sender_profile_fields_are_optional_wire_fields():
    hints = get_type_hints(SlackWebhookData)
    assert "actor_profile" in hints and "contact_id" in hints
    actor_hints = get_type_hints(SlackActorProfile, include_extras=True)
    assert actor_hints["id"] is str
    assert all(get_origin(value) is NotRequired for key, value in actor_hints.items() if key != "id")
    sender = DATA["webhook"]["data"]["actor_profile"]
    assert sender["profile"]["email"] == "person@example.com"
    assert sender["is_bot"] is False and sender["tz_offset"] == 0


def test_needs_credentials_and_selected_workspace_parse():
    from inkbox.slack import _parse
    setup = _parse(SlackSetupStatus, {"status": "needs_credentials", "error_code": "credentials_required", "provisioning_workspace_id": None})
    assert setup.status == "needs_credentials"
    assert setup.provisioning_workspace_id is None


@pytest.mark.parametrize("name_fields,expected_name", [
    ({}, None), ({"user_name": None}, None), ({"user_name": "first-owner"}, "first-owner"),
])
def test_creator_scoped_workspace_metadata_is_optional_and_preserves_distinct_grants(name_fields, expected_name):
    workspace = json.loads((Path(__file__).parents[3] / "tests/fixtures/slack.json").read_text())["provisioning_workspace"]
    first = {**{key: value for key, value in workspace.items() if key != "user_name"}, **name_fields}
    second = {**workspace, "id": "55555555-5555-4555-8555-555555555555",
              "user_id": "USECOND", "user_name": "second-owner"}
    requests = []

    def handle(request):
        requests.append(request)
        if request.url.path.endswith("/connections"):
            body = {"connections": [], "installation_available": False, "provisioning_workspace": first}
        else:
            body = {"workspaces": [first, second]} if request.method == "GET" else first
        return httpx.Response(200, json=body)

    with Inkbox(api_key="synthetic-test-key", base_url="https://example.com") as client:
        client._api_http._client.close()
        client._api_http._client = httpx.Client(base_url="https://example.com/api/v1", transport=httpx.MockTransport(handle))
        rows = client.slack.list_provisioning_workspaces()
        assert len(rows) == 2 and rows[0].workspace_id == rows[1].workspace_id
        assert rows[0].id != rows[1].id and rows[0].user_id != rows[1].user_id
        assert rows[0].user_name == expected_name and rows[1].user_name == "second-owner"
        saved = client.slack.save_provisioning_workspace(access_token="synthetic-access", refresh_token="synthetic-refresh")
        assert saved.user_name == expected_name
        assert json.loads(requests[1].content) == {"access_token": "synthetic-access", "refresh_token": "synthetic-refresh"}
        assert client.slack.list_connections(DATA["identity_id"]).provisioning_workspace.user_name == expected_name
