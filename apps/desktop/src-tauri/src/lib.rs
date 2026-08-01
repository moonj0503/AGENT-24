pub mod commands;
pub mod models;
pub mod privacy;
pub mod observer;
pub mod platform;
pub mod storage;

use tauri::Manager;

pub const RAW_API_STREAM_WINDOW_LABEL: &str = "raw-api-stream";

#[tauri::command]
fn show_raw_api_stream_window(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window(RAW_API_STREAM_WINDOW_LABEL)
        .ok_or_else(|| "Raw API Stream window is not configured".to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            let repository = storage::ActivityRepository::open(directory.join("continuity-activity.db"))?;
            app.manage(commands::activity::ObserverState::new(repository));
            app.manage(commands::screenshot::ScreenshotState::new(directory.join("screenshots")));
            app.manage(commands::files::FileToolState::new(directory.join("exports"), directory.clone()));
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
            commands::screenshot::capture_observation_screenshot,
            commands::files::write_text_file,
            commands::files::authorize_text_file,
            commands::files::list_approved_text_files,
            commands::files::revoke_text_file_authorization,
            commands::files::read_approved_text_file,
            commands::files::apply_approved_text_patch,
            commands::overlay::show_overlay,
            commands::overlay::hide_overlay,
            commands::overlay::position_overlay,
            commands::overlay::open_main_window,
            show_raw_api_stream_window
        ])
        .run(tauri::generate_context!())
        .expect("run Tauri application");
}

#[cfg(test)]
mod tests {
    use super::RAW_API_STREAM_WINDOW_LABEL;

    #[test]
    fn raw_api_stream_window_label_is_stable() {
        assert_eq!(RAW_API_STREAM_WINDOW_LABEL, "raw-api-stream");
    }
}
