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
    user_blocked_applications: Mutex<Vec<String>>,
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

#[tauri::command]
pub fn load_observation_state(state: tauri::State<'_, ObserverState>) -> Result<Option<serde_json::Value>, String> {
    state.repository.load_observation_state().map_err(|_| "observation state could not be loaded".to_owned())
}

#[tauri::command]
pub fn save_observation_state(value: serde_json::Value, state: tauri::State<'_, ObserverState>) -> Result<(), String> {
    state.repository.save_observation_state(&value).map_err(|_| "observation state could not be saved".to_owned())
}

#[tauri::command]
pub fn clear_observation_state(state: tauri::State<'_, ObserverState>) -> Result<(), String> {
    state.repository.clear_observation_state().map_err(|_| "observation state could not be cleared".to_owned())
}

#[tauri::command]
pub fn set_user_blocked_applications(applications: Vec<String>, state: tauri::State<'_, ObserverState>) {
    state.set_user_blocked_applications(applications);
}

impl ObserverState {
    pub fn new(repository: ActivityRepository) -> Self {
        Self {
            repository,
            session: Mutex::new(ObserverSession::new(300)),
            mock_enabled: AtomicBool::new(false),
            test_snapshot: Mutex::new(None),
            user_blocked_applications: Mutex::new(Vec::new()),
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
        if self.user_blocked_applications.lock().map_err(|_| "privacy settings lock poisoned".to_owned())?
            .iter().any(|blocked| snapshot.application_name.trim().to_lowercase() == *blocked) {
            return Ok(None);
        }

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

    pub fn set_user_blocked_applications(&self, applications: Vec<String>) {
        *self.user_blocked_applications.lock().expect("privacy settings lock poisoned") = applications
            .into_iter().map(|value| value.trim().to_lowercase()).filter(|value| !value.is_empty()).collect();
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
