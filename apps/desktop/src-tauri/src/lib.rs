pub mod commands;
pub mod models;
pub mod privacy;
pub mod observer;
pub mod platform;
pub mod storage;
use tauri::Manager;
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            let repository = storage::ActivityRepository::open(directory.join("continuity-activity.db"))?;
            app.manage(commands::activity::ObserverState::new(repository));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::activity::get_current_activity,
            commands::activity::get_recent_activity_events,
            commands::activity::set_mock_observer,
            commands::activity::load_observation_state,
            commands::activity::save_observation_state,
            commands::activity::clear_observation_state,
            commands::activity::set_user_blocked_applications,
            commands::overlay::show_overlay,
            commands::overlay::hide_overlay,
            commands::overlay::position_overlay,
            commands::overlay::open_main_window
        ])
        .run(tauri::generate_context!())
        .expect("run Tauri application");
}
