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
    Development,
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
    Code,
    WebPage,
    Chat,
    Other,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct Metadata {
    #[serde(rename = "idleSeconds")]
    pub idle_seconds: u64,
}

impl ActivityEvent {
    pub fn from_snapshot(event_type: ActivityEventType, snapshot: SanitizedSnapshot) -> Self {
        let resource_kind = match snapshot.category {
            ApplicationCategory::Document => ResourceKind::Document,
            ApplicationCategory::Development => ResourceKind::Code,
            ApplicationCategory::Browser => ResourceKind::WebPage,
            ApplicationCategory::Communication => ResourceKind::Chat,
            ApplicationCategory::Other => ResourceKind::Other,
        };

        Self {
            event_id: uuid::Uuid::new_v4().to_string(),
            event_type,
            occurred_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            application: Application {
                name: snapshot.application_name,
                category: snapshot.category,
            },
            resource: Some(Resource {
                title: snapshot.window_title,
                kind: resource_kind,
            }),
            metadata: Metadata {
                idle_seconds: snapshot.idle_seconds,
            },
        }
    }
}
