use continuity_desktop::{
    observer::MockObservationSource, platform::windows::normalize_title, privacy::sanitize_snapshot,
};

#[test]
fn normalizes_nonempty_window_title() {
    assert_eq!(
        normalize_title("  Final Report - Word "),
        Some("Final Report - Word".into())
    );
    assert_eq!(normalize_title("   "), None);
}

#[test]
fn mock_source_provides_an_allowed_redacted_snapshot() {
    let raw = MockObservationSource::default()
        .read_snapshot()
        .unwrap()
        .unwrap();

    assert!(sanitize_snapshot(raw).is_some());
}
