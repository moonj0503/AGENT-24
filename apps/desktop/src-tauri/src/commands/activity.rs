use std::sync::{atomic::{AtomicBool, Ordering}, Mutex};

use crate::{
    models::{ActivityEvent, RawWindowSnapshot},
    observer::{MockObservationSource, ObserverSession},
    platform::WindowsObservationSource,
    privacy::sanitize_snapshot,
    storage::ActivityRepository,
};

pub struct ObserverState {
    repository: ActivityRepository,
    session: Mutex<ObserverSession>,
    mock_enabled: AtomicBool,
    test_snapshot: Mutex<Option<RawWindowSnapshot>>,
}

#[tauri::command]
pub fn get_current_activity(
    state: tauri::State<'_, ObserverState>,
) -> Result<Option<ActivityEvent>, String> {
    state.poll()
}

#[tauri::command]
pub fn get_recent_activity_events(
    limit: u32,
    state: tauri::State<'_, ObserverState>,
) -> Result<Vec<ActivityEvent>, String> {
    state.recent(limit)
}

#[tauri::command]
pub fn set_mock_observer(enabled: bool, state: tauri::State<'_, ObserverState>) {
    state.set_mock_enabled(enabled);
}

impl ObserverState {
    pub fn new(repository: ActivityRepository) -> Self {
        Self {
            repository,
            session: Mutex::new(ObserverSession::new(300)),
            mock_enabled: AtomicBool::new(false),
            test_snapshot: Mutex::new(None),
        }
    }

    pub fn for_test(snapshot: RawWindowSnapshot) -> Self {
        let state = Self::new(ActivityRepository::in_memory().expect("in-memory repository"));
        *state.test_snapshot.lock().expect("test snapshot lock poisoned") = Some(snapshot);
        state
    }

    pub fn poll(&self) -> Result<Option<ActivityEvent>, String> {
        let raw = self.read_snapshot()?;
        let Some(snapshot) = raw.and_then(sanitize_snapshot) else {
            return Ok(None);
        };

        let event = self
            .session
            .lock()
            .map_err(|_| "observer session lock poisoned".to_owned())?
            .observe(snapshot);
        if let Some(event) = &event {
            self.repository.append(event).map_err(|error| error.to_string())?;
        }
        Ok(event)
    }

    pub fn recent(&self, limit: u32) -> Result<Vec<ActivityEvent>, String> {
        self.repository.recent(limit).map_err(|error| error.to_string())
    }

    pub fn set_mock_enabled(&self, enabled: bool) {
        self.mock_enabled.store(enabled, Ordering::Relaxed);
    }

    fn read_snapshot(&self) -> Result<Option<RawWindowSnapshot>, String> {
        if let Some(snapshot) = self
            .test_snapshot
            .lock()
            .map_err(|_| "test snapshot lock poisoned".to_owned())?
            .clone()
        {
            return Ok(Some(snapshot));
        }

        if self.mock_enabled.load(Ordering::Relaxed) {
            return MockObservationSource::default()
                .read_snapshot()
                .map_err(|error| format!("observation failed: {error:?}"));
        }

        WindowsObservationSource
            .read_snapshot()
            .map_err(|error| format!("observation failed: {error:?}"))
    }
}
