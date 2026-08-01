use continuity_desktop::{
    models::{ActivityEvent, ActivityEventType, Application, ApplicationCategory, Metadata},
    storage::ActivityRepository,
};

fn event(event_id: &str, occurred_at: &str) -> ActivityEvent {
    ActivityEvent {
        event_id: event_id.into(),
        event_type: ActivityEventType::ActiveWindowChanged,
        occurred_at: occurred_at.into(),
        application: Application {
            name: "Word".into(),
            category: ApplicationCategory::Document,
        },
        resource: None,
        metadata: Metadata { idle_seconds: 0 },
    }
}

#[test]
fn returns_newest_sanitized_event_first() {
    let repository = ActivityRepository::in_memory().unwrap();
    repository
        .append(&event("first", "2026-08-01T00:00:00Z"))
        .unwrap();
    repository
        .append(&event("second", "2026-08-01T00:01:00Z"))
        .unwrap();

    assert_eq!(repository.recent(10).unwrap()[0].event_id, "second");
}

#[test]
fn observation_workflow_state_round_trips_and_clears() {
    let repository = ActivityRepository::in_memory().unwrap();
    let state = serde_json::json!({ "version": 1, "workSessionId": "session" });
    repository.save_observation_state(&state).unwrap();
    assert_eq!(repository.load_observation_state().unwrap(), Some(state));
    repository.clear_observation_state().unwrap();
    assert_eq!(repository.load_observation_state().unwrap(), None);
}
