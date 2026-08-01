use continuity_desktop::{
    models::ApplicationCategory,
    privacy::{classify_application, is_blocked, redact_title},
};

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

#[test]
fn classifies_code_editors_without_collecting_extra_data() {
    assert_eq!(classify_application("Code"), ApplicationCategory::Development);
    assert_eq!(classify_application("pycharm64"), ApplicationCategory::Development);
}
