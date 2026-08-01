const BLOCKED_APPLICATIONS: &[&str] = &[
    "1password",
    "authy",
    "bitwarden",
    "dashlane",
    "google authenticator",
    "keeper",
    "lastpass",
    "microsoft authenticator",
    "okta verify",
];
const PRIVATE_WINDOW_MARKERS: &[&str] = &["incognito", "inprivate", "private browsing"];

pub fn is_blocked(application_name: &str, window_title: &str) -> bool {
    let application_name = application_name.to_lowercase();
    let window_title = window_title.to_lowercase();
    BLOCKED_APPLICATIONS
        .iter()
        .any(|blocked| application_name.contains(blocked))
        || PRIVATE_WINDOW_MARKERS
            .iter()
            .any(|marker| window_title.contains(marker))
}
