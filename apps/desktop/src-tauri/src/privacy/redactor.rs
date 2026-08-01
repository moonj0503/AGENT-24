use regex::Regex;
use std::sync::LazyLock;

static EMAIL_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b").expect("valid email regex")
});
static PHONE_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?x)(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,3}\)?[-.\s]?)\d{3,4}[-.\s]\d{4}")
        .expect("valid phone regex")
});
static LONG_NUMBER_PATTERN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\b\d{8,}\b").expect("valid number regex"));

pub fn redact_title(title: &str) -> String {
    let title = EMAIL_PATTERN.replace_all(title, "[REDACTED_EMAIL]");
    let title = PHONE_PATTERN.replace_all(&title, "[REDACTED_PHONE]");
    LONG_NUMBER_PATTERN
        .replace_all(&title, "[REDACTED_NUMBER]")
        .into_owned()
}
