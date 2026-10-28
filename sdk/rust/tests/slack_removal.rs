use httpmock::{Method::GET, Method::POST, MockServer};
use inkbox::{Inkbox, SlackAppDeletionStatus, SlackApplicationRemovalStatus};
use serde_json::{json, Value};
use uuid::Uuid;

fn data() -> Value {
    serde_json::from_str(include_str!("../../../tests/fixtures/slack_removal.json")).unwrap()
}

#[test]
fn removal_preserves_request_identity_without_creating_another_app() {
    let data = data();
    let server = MockServer::start();
    let client = Inkbox::builder("synthetic-test-key")
        .base_url(server.base_url())
        .build()
        .unwrap();
    let identity = Uuid::parse_str(data["identity_id"].as_str().unwrap()).unwrap();
    let operation = Uuid::parse_str(data["request_id"].as_str().unwrap()).unwrap();
    let expected = server.mock(|when, then| {
        when.method(POST).path("/api/v1/slack/applications/remove").json_body(json!({
            "identity_id": identity, "expected_application_generation": 2, "request_id": operation
        }));
        then.status(202).json_body(data["response"].clone());
    });
    for _ in 0..2 {
        let result = client
            .slack()
            .remove_application(identity, 2, operation)
            .unwrap();
        assert_eq!(result.operation_id, operation);
        assert_eq!(result.status, SlackApplicationRemovalStatus::Removed);
        assert!(serde_json::to_value(&result)
            .unwrap()
            .get("setup")
            .is_none());
        assert_eq!(result.deletion_status, SlackAppDeletionStatus::Pending);
    }
    expected.assert_hits(2);
}

#[test]
fn deletion_outcomes_remain_independent_from_removed_status() {
    let data = data();
    let server = MockServer::start();
    let client = Inkbox::builder("synthetic-test-key")
        .base_url(server.base_url())
        .build()
        .unwrap();
    let operation = Uuid::parse_str(data["request_id"].as_str().unwrap()).unwrap();
    for (status, expected) in [
        ("not_requested", SlackAppDeletionStatus::NotRequested),
        ("pending", SlackAppDeletionStatus::Pending),
        ("deleted", SlackAppDeletionStatus::Deleted),
        ("already_deleted", SlackAppDeletionStatus::AlreadyDeleted),
        ("failed", SlackAppDeletionStatus::Failed),
        ("unknown", SlackAppDeletionStatus::Unknown),
    ] {
        let mut response = data["response"].clone();
        response["deletion_status"] = json!(status);
        response["deletion_error_code"] = if status == "failed" {
            json!("credentials_required")
        } else {
            Value::Null
        };
        let mut mock = server.mock(|when, then| {
            when.method(GET)
                .path(format!("/api/v1/slack/applications/removals/{operation}"));
            then.status(200).json_body(response);
        });
        let result = client.slack().get_application_removal(operation).unwrap();
        assert_eq!(result.deletion_status, expected);
        assert_eq!(result.status, SlackApplicationRemovalStatus::Removed);
        assert!(serde_json::to_value(&result)
            .unwrap()
            .get("setup")
            .is_none());
        assert_eq!(
            result.deletion_error_code.as_deref(),
            if status == "failed" {
                Some("credentials_required")
            } else {
                None
            }
        );
        mock.assert();
        mock.delete();
    }
}

#[test]
fn generation_parses_and_older_responses_remain_supported() {
    let data = data();
    let server = MockServer::start();
    let client = Inkbox::builder("synthetic-test-key")
        .base_url(server.base_url())
        .build()
        .unwrap();
    let identity = Uuid::parse_str(data["identity_id"].as_str().unwrap()).unwrap();
    for generation in [None, Some(3)] {
        let mut body = json!({"connections": [], "installation_available": false});
        if let Some(value) = generation {
            body["application_generation"] = json!(value);
        }
        let mut mock = server.mock(|when, then| {
            when.method(GET)
                .path("/api/v1/slack/connections")
                .query_param("identity_id", identity.to_string());
            then.status(200).json_body(body);
        });
        assert_eq!(
            client
                .slack()
                .list_connections(identity)
                .unwrap()
                .application_generation,
            generation
        );
        mock.assert();
        mock.delete();
    }
}

#[test]
fn fresh_setup_requires_a_separate_workspace_choice() {
    let data = data();
    let server = MockServer::start();
    let client = Inkbox::builder("synthetic-test-key")
        .base_url(server.base_url())
        .build()
        .unwrap();
    let identity = Uuid::parse_str(data["identity_id"].as_str().unwrap()).unwrap();
    let operation = Uuid::parse_str(data["request_id"].as_str().unwrap()).unwrap();
    let workspace =
        Uuid::parse_str(data["fresh_provisioning_workspace_id"].as_str().unwrap()).unwrap();
    let remove = server.mock(|when, then| {
        when.method(POST).path("/api/v1/slack/applications/remove");
        then.status(202).json_body(data["response"].clone());
    });
    let current = server.mock(|when, then| {
        when.method(GET)
            .path("/api/v1/slack/connections")
            .query_param("identity_id", identity.to_string());
        then.status(200).json_body(data["detached"].clone());
    });
    let setup = server.mock(|when, then| {
        when.method(POST)
            .path("/api/v1/slack/applications/setup")
            .json_body(json!({"identity_id": identity, "provisioning_workspace_id": workspace}));
        then.status(202).json_body(json!({"status": "pending"}));
    });
    let poll = server.mock(|when, then| {
        when.method(GET)
            .path(format!("/api/v1/slack/applications/removals/{operation}"));
        then.status(200).json_body(data["response"].clone());
    });
    client
        .slack()
        .remove_application(identity, 2, operation)
        .unwrap();
    remove.assert_hits(1);
    setup.assert_hits(0);
    let detached = client.slack().list_connections(identity).unwrap();
    let detached_setup = detached.setup.unwrap();
    assert_eq!(
        detached_setup.status,
        inkbox::SlackSetupState::NeedsCredentials
    );
    assert!(detached_setup.provisioning_workspace_id.is_none());
    assert!(!detached.application_created);
    current.assert_hits(1);
    setup.assert_hits(0);
    client.slack().start_setup(identity, workspace).unwrap();
    setup.assert_hits(1);
    assert_eq!(
        client
            .slack()
            .get_application_removal(operation)
            .unwrap()
            .status,
        SlackApplicationRemovalStatus::Removed
    );
    poll.assert_hits(1);
}
