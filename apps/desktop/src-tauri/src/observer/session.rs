use crate::models::{ActivityEvent, ActivityEventType, SanitizedSnapshot};

pub struct ObserverSession {
    idle_threshold_seconds: u64,
    previous: Option<SanitizedSnapshot>,
}

impl ObserverSession {
    pub fn new(idle_threshold_seconds: u64) -> Self {
        Self {
            idle_threshold_seconds,
            previous: None,
        }
    }

    pub fn observe(&mut self, next: SanitizedSnapshot) -> Option<ActivityEvent> {
        let event_type = self.transition_type(&next);
        self.previous = Some(next.clone());
        event_type.map(|event_type| ActivityEvent::from_snapshot(event_type, next))
    }

    fn transition_type(&self, next: &SanitizedSnapshot) -> Option<ActivityEventType> {
        let Some(previous) = &self.previous else {
            return Some(ActivityEventType::ActiveWindowChanged);
        };

        if previous.application_name != next.application_name
            || previous.window_title != next.window_title
        {
            return Some(ActivityEventType::ActiveWindowChanged);
        }

        if previous.idle_seconds < self.idle_threshold_seconds
            && next.idle_seconds >= self.idle_threshold_seconds
        {
            return Some(ActivityEventType::UserIdle);
        }

        if previous.idle_seconds >= self.idle_threshold_seconds
            && next.idle_seconds < self.idle_threshold_seconds
        {
            return Some(ActivityEventType::UserActivity);
        }

        None
    }
}
