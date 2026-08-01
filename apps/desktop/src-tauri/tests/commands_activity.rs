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
