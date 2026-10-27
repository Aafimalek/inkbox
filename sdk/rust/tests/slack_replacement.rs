use httpmock::{Method::GET, Method::POST, MockServer};
use inkbox::{Inkbox, SlackAppDeletionStatus, SlackReplaceApplicationOptions, SlackSetupState};
use serde_json::{json, Value};
use uuid::Uuid;

fn data() -> Value {
    serde_json::from_str(include_str!(
        "../../../tests/fixtures/slack_replacement.json"
    ))
    .unwrap()
}

#[test]
fn replacement_preserves_request_identity_and_defaults_remote_deletion_off() {
    let data = data();
    let server = MockServer::start();
    let client = Inkbox::builder("synthetic-test-key")
        .base_url(server.base_url())
        .build()
        .unwrap();
    let identity = Uuid::parse_str(data["identity_id"].as_str().unwrap()).unwrap();
    let operation = Uuid::parse_str(data["request_id"].as_str().unwrap()).unwrap();
    for delete in [false, true] {
        let mut expected = server.mock(|when, then| {
            when.method(POST)
                .path("/api/v1/slack/applications/replace")
                .json_body(
                    json!({"identity_id": identity, "expected_application_generation": 2,
                    "request_id": operation, "delete_old_app": delete}),
                );
            then.status(202).json_body(data["response"].clone());
        });
        let options = if delete {
            SlackReplaceApplicationOptions {
                delete_old_app: true,
            }
        } else {
            SlackReplaceApplicationOptions::default()
        };
        for _ in 0..2 {
            let result = client
                .slack()
                .replace_application(identity, 2, operation, &options)
                .unwrap();
            assert_eq!(result.operation_id, operation);
            assert_eq!(result.setup.status, SlackSetupState::Pending);
            assert_eq!(
                result.setup.retry_at.as_deref(),
                Some("2026-10-27T12:00:00Z")
            );
            assert_eq!(result.deletion_status, SlackAppDeletionStatus::NotRequested);
        }
        expected.assert_hits(2);
        expected.delete();
    }
}

#[test]
fn deletion_outcomes_remain_independent_from_setup() {
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
            when.method(GET).path(format!(
                "/api/v1/slack/applications/replacements/{operation}"
            ));
            then.status(200).json_body(response);
        });
        let result = client.slack().get_replacement(operation).unwrap();
        assert_eq!(result.deletion_status, expected);
        assert_eq!(result.setup.status, SlackSetupState::Pending);
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
