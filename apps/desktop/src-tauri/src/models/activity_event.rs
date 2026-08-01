use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct RawWindowSnapshot {
    pub application_name: String,
    pub window_title: String,
    pub idle_seconds: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct SanitizedSnapshot {
    pub application_name: String,
    pub window_title: String,
    pub category: ApplicationCategory,
    pub idle_seconds: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ApplicationCategory {
    Document,
    Browser,
    Communication,
    Other,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ActivityEventType {
    ActiveWindowChanged,
    ApplicationOpened,
    ApplicationClosed,
    DocumentSaved,
    BrowserTabChanged,
    UserActivity,
    UserIdle,
    CalendarEventApproaching,
    ManualCheckpoint,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct ActivityEvent {
    #[serde(rename = "eventId")]
    pub event_id: String,
    #[serde(rename = "type")]
    pub event_type: ActivityEventType,
    #[serde(rename = "occurredAt")]
    pub occurred_at: String,
    pub application: Application,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource: Option<Resource>,
    pub metadata: Metadata,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct Application {
    pub name: String,
    pub category: ApplicationCategory,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct Resource {
    pub title: String,
    pub kind: ResourceKind,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ResourceKind {
    Document,
    WebPage,
    Chat,
    Other,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct Metadata {
    #[serde(rename = "idleSeconds")]
    pub idle_seconds: u64,
}
