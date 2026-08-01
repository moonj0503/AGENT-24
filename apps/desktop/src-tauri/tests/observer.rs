use continuity_desktop::{
    models::{ActivityEventType, ApplicationCategory, SanitizedSnapshot},
    observer::ObserverSession,
};

fn snapshot(application_name: &str, window_title: &str, idle_seconds: u64) -> SanitizedSnapshot {
    SanitizedSnapshot {
        application_name: application_name.into(),
        window_title: window_title.into(),
        category: ApplicationCategory::Document,
        idle_seconds,
    }
}

#[test]
fn emits_once_for_changed_allowed_window() {
    let mut session = ObserverSession::new(300);

    assert_eq!(
        session
            .observe(snapshot("Word", "Report", 0))
            .unwrap()
            .event_type,
        ActivityEventType::ActiveWindowChanged
    );
    assert!(session.observe(snapshot("Word", "Report", 0)).is_none());
}

#[test]
fn emits_idle_only_when_threshold_is_crossed() {
    let mut session = ObserverSession::new(300);

    session.observe(snapshot("Word", "Report", 0));
    assert!(session.observe(snapshot("Word", "Report", 299)).is_none());
    assert_eq!(
        session
            .observe(snapshot("Word", "Report", 300))
            .unwrap()
            .event_type,
        ActivityEventType::UserIdle
    );
}
#[test]
fn emits_activity_when_returning_below_idle_threshold() {
    let mut session = ObserverSession::new(300);

    session.observe(snapshot("Word", "Report", 0));
    session.observe(snapshot("Word", "Report", 300));
    assert_eq!(
        session
            .observe(snapshot("Word", "Report", 0))
            .unwrap()
            .event_type,
        ActivityEventType::UserActivity
    );
}
