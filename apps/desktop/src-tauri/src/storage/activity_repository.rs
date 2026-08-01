use std::{path::Path, sync::Mutex};

use rusqlite::{params, Connection, Result};

use crate::models::{
    ActivityEvent, ActivityEventType, Application, ApplicationCategory, Metadata, Resource,
    ResourceKind,
};

use super::database::initialize;

pub struct ActivityRepository {
    connection: Mutex<Connection>,
}

impl ActivityRepository {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let connection = Connection::open(path)?;
        initialize(&connection)?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    pub fn in_memory() -> Result<Self> {
        let connection = Connection::open_in_memory()?;
        initialize(&connection)?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    pub fn append(&self, event: &ActivityEvent) -> Result<()> {
        let connection = self
            .connection
            .lock()
            .expect("activity database lock poisoned");
        connection.execute(
            "
            INSERT INTO activity_events (
                event_id, event_type, occurred_at, application_name, application_category,
                resource_title, resource_kind, idle_seconds
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ",
            params![
                event.event_id,
                event_type_name(&event.event_type),
                event.occurred_at,
                event.application.name,
                category_name(&event.application.category),
                event.resource.as_ref().map(|resource| &resource.title),
                event
                    .resource
                    .as_ref()
                    .map(|resource| resource_kind_name(&resource.kind)),
                event.metadata.idle_seconds,
            ],
        )?;
        Ok(())
    }

    pub fn recent(&self, limit: u32) -> Result<Vec<ActivityEvent>> {
        let connection = self
            .connection
            .lock()
            .expect("activity database lock poisoned");
        let mut statement = connection.prepare(
            "
            SELECT event_id, event_type, occurred_at, application_name, application_category,
                   resource_title, resource_kind, idle_seconds
            FROM activity_events
            ORDER BY occurred_at DESC
            LIMIT ?1
            ",
        )?;
        let events = statement
            .query_map(params![limit], |row| {
                let resource_title: Option<String> = row.get(5)?;
                let resource_kind: Option<String> = row.get(6)?;
                Ok(ActivityEvent {
                    event_id: row.get(0)?,
                    event_type: event_type_from_name(&row.get::<_, String>(1)?),
                    occurred_at: row.get(2)?,
                    application: Application {
                        name: row.get(3)?,
                        category: category_from_name(&row.get::<_, String>(4)?),
                    },
                    resource: resource_title.map(|title| Resource {
                        title,
                        kind: resource_kind
                            .as_deref()
                            .map(resource_kind_from_name)
                            .unwrap_or(ResourceKind::Other),
                    }),
                    metadata: Metadata {
                        idle_seconds: row.get(7)?,
                    },
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(events)
    }
}

fn event_type_name(event_type: &ActivityEventType) -> &'static str {
    match event_type {
        ActivityEventType::ActiveWindowChanged => "ACTIVE_WINDOW_CHANGED",
        ActivityEventType::ApplicationOpened => "APPLICATION_OPENED",
        ActivityEventType::ApplicationClosed => "APPLICATION_CLOSED",
        ActivityEventType::DocumentSaved => "DOCUMENT_SAVED",
        ActivityEventType::BrowserTabChanged => "BROWSER_TAB_CHANGED",
        ActivityEventType::UserActivity => "USER_ACTIVITY",
        ActivityEventType::UserIdle => "USER_IDLE",
        ActivityEventType::CalendarEventApproaching => "CALENDAR_EVENT_APPROACHING",
        ActivityEventType::ManualCheckpoint => "MANUAL_CHECKPOINT",
    }
}

fn event_type_from_name(value: &str) -> ActivityEventType {
    match value {
        "ACTIVE_WINDOW_CHANGED" => ActivityEventType::ActiveWindowChanged,
        "APPLICATION_OPENED" => ActivityEventType::ApplicationOpened,
        "APPLICATION_CLOSED" => ActivityEventType::ApplicationClosed,
        "DOCUMENT_SAVED" => ActivityEventType::DocumentSaved,
        "BROWSER_TAB_CHANGED" => ActivityEventType::BrowserTabChanged,
        "USER_ACTIVITY" => ActivityEventType::UserActivity,
        "USER_IDLE" => ActivityEventType::UserIdle,
        "CALENDAR_EVENT_APPROACHING" => ActivityEventType::CalendarEventApproaching,
        _ => ActivityEventType::ManualCheckpoint,
    }
}

fn category_name(category: &ApplicationCategory) -> &'static str {
    match category {
        ApplicationCategory::Document => "DOCUMENT",
        ApplicationCategory::Browser => "BROWSER",
        ApplicationCategory::Communication => "COMMUNICATION",
        ApplicationCategory::Other => "OTHER",
    }
}

fn category_from_name(value: &str) -> ApplicationCategory {
    match value {
        "DOCUMENT" => ApplicationCategory::Document,
        "BROWSER" => ApplicationCategory::Browser,
        "COMMUNICATION" => ApplicationCategory::Communication,
        _ => ApplicationCategory::Other,
    }
}

fn resource_kind_name(kind: &ResourceKind) -> &'static str {
    match kind {
        ResourceKind::Document => "DOCUMENT",
        ResourceKind::WebPage => "WEB_PAGE",
        ResourceKind::Chat => "CHAT",
        ResourceKind::Other => "OTHER",
    }
}

fn resource_kind_from_name(value: &str) -> ResourceKind {
    match value {
        "DOCUMENT" => ResourceKind::Document,
        "WEB_PAGE" => ResourceKind::WebPage,
        "CHAT" => ResourceKind::Chat,
        _ => ResourceKind::Other,
    }
}
