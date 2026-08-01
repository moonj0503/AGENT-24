use continuity_desktop::{
    commands::activity::ObserverState,
    models::RawWindowSnapshot,
};

#[test]
fn blocked_poll_neither_returns_nor_persists_an_event() {
    let state = ObserverState::for_test(RawWindowSnapshot {
        application_name: "1Password".into(),
        window_title: "Vault".into(),
        idle_seconds: 0,
    });

    assert!(state.poll().unwrap().is_none());
    assert!(state.recent(10).unwrap().is_empty());
}

#[test]
fn user_blocked_application_neither_returns_nor_persists_an_event() {
    let state = ObserverState::for_test(RawWindowSnapshot {
        application_name: "Private Writer".into(),
        window_title: "Redacted by native privacy".into(),
        idle_seconds: 0,
    });
    state.set_user_blocked_applications(vec!["private writer".into()]);
    assert!(state.poll().unwrap().is_none());
    assert!(state.recent(10).unwrap().is_empty());
}

#[test]
fn default_idle_threshold_is_thirty_seconds() {
    assert_eq!(continuity_desktop::commands::activity::DEFAULT_IDLE_THRESHOLD_SECONDS, 30);
}
