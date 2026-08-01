use crate::{
    models::{ApplicationCategory, RawWindowSnapshot, SanitizedSnapshot},
    privacy::{is_blocked, redact_title},
};

pub fn sanitize_snapshot(raw: RawWindowSnapshot) -> Option<SanitizedSnapshot> {
    (!is_blocked(&raw.application_name, &raw.window_title)).then(|| SanitizedSnapshot {
        category: classify_application(&raw.application_name),
        application_name: raw.application_name,
        window_title: redact_title(&raw.window_title),
        idle_seconds: raw.idle_seconds,
    })
}

pub fn classify_application(application_name: &str) -> ApplicationCategory {
    let name = application_name.to_lowercase();
    if [
        "word",
        "excel",
        "powerpoint",
        "notion",
        "onenote",
        "acrobat",
    ]
    .iter()
    .any(|marker| name.contains(marker))
    {
        ApplicationCategory::Document
    } else if [
        "code", "vscode", "devenv", "idea", "pycharm", "webstorm", "rider",
        "android studio", "sublime_text", "notepad++",
    ]
    .iter()
    .any(|marker| name.contains(marker))
    {
        ApplicationCategory::Development
    } else if ["chrome", "firefox", "edge", "browser", "brave", "safari"]
        .iter()
        .any(|marker| name.contains(marker))
    {
        ApplicationCategory::Browser
    } else if ["slack", "teams", "discord", "zoom", "outlook", "mail"]
        .iter()
        .any(|marker| name.contains(marker))
    {
        ApplicationCategory::Communication
    } else {
        ApplicationCategory::Other
    }
}
