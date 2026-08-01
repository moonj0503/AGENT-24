use continuity_desktop::privacy::{is_blocked, redact_title};

#[test]
fn rejects_password_manager_and_incognito_window() {
    assert!(is_blocked("1Password", "Vault"));
    assert!(is_blocked("Chrome", "New Incognito Tab"));
}

#[test]
fn masks_sensitive_title_content() {
    assert_eq!(
        redact_title("a@b.com 010-1234-5678 12345678"),
        "[REDACTED_EMAIL] [REDACTED_PHONE] [REDACTED_NUMBER]"
    );
}
