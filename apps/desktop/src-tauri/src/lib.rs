pub mod commands;
pub mod models;
pub mod privacy;

pub mod observer;

pub mod platform;

pub mod storage;

pub fn run() {
    let repository = storage::ActivityRepository::open("continuity-activity.db")
        .expect("open activity database");
    tauri::Builder::default()
        .manage(commands::activity::ObserverState::new(repository))
        .invoke_handler(tauri::generate_handler![
            commands::activity::get_current_activity,
            commands::activity::get_recent_activity_events,
            commands::activity::set_mock_observer
        ])
        .run(tauri::generate_context!())
        .expect("run Tauri application");
}
