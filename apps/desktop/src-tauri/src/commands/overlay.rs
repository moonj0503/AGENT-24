use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize};

pub const OVERLAY_LABEL: &str = "quick-overlay";
pub const MAIN_LABEL: &str = "main";
pub const VALID_MAIN_SCREENS: &[&str] = &[
    "dashboard",
    "goal",
    "gap",
    "recovery",
    "history",
    "permissions",
];
const TOP_MARGIN: i64 = 24;
const RIGHT_MARGIN: i64 = 24;

pub fn overlay_position(
    work_area_position: PhysicalPosition<i32>,
    work_area_size: PhysicalSize<u32>,
    window_size: PhysicalSize<u32>,
) -> PhysicalPosition<i32> {
    let left = i64::from(work_area_position.x);
    let top = i64::from(work_area_position.y);
    let right = left + i64::from(work_area_size.width);
    let bottom = top + i64::from(work_area_size.height);
    let window_width = i64::from(window_size.width);
    let window_height = i64::from(window_size.height);
    let max_x = (right - window_width).max(left);
    let max_y = (bottom - window_height).max(top);
    let x = (right - window_width - RIGHT_MARGIN).clamp(left, max_x);
    let y = (top + TOP_MARGIN).clamp(top, max_y);
    PhysicalPosition::new(x as i32, y as i32)
}

#[tauri::command]
pub fn show_overlay(app: AppHandle) -> Result<(), String> {
    let overlay = overlay_window(&app)?;
    overlay.set_shadow(false).map_err(|error| error.to_string())?;
    position_overlay_window(&app, &overlay)?;
    overlay.set_always_on_top(true).map_err(|error| error.to_string())?;
    overlay.show().map_err(|error| error.to_string())?;
    overlay.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn hide_overlay(app: AppHandle) -> Result<(), String> {
    overlay_window(&app)?.hide().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn position_overlay(app: AppHandle) -> Result<(), String> {
    let overlay = overlay_window(&app)?;
    position_overlay_window(&app, &overlay)
}

#[tauri::command]
pub fn open_main_window(screen: String, app: AppHandle) -> Result<(), String> {
    if !VALID_MAIN_SCREENS.contains(&screen.as_str()) { return Err(format!("unsupported main-window screen: {screen}")); }
    if let Some(overlay) = app.get_webview_window(OVERLAY_LABEL) {
        overlay.hide().map_err(|error| error.to_string())?;
    }
    let main = app.get_webview_window(MAIN_LABEL).ok_or_else(|| "main window is unavailable".to_owned())?;
    main.show().map_err(|error| error.to_string())?;
    main.set_focus().map_err(|error| error.to_string())?;
    main.emit("main:navigate", screen).map_err(|error| error.to_string())
}

fn overlay_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    app.get_webview_window(OVERLAY_LABEL).ok_or_else(|| "quick overlay window is unavailable".to_owned())
}

fn position_overlay_window(app: &AppHandle, overlay: &tauri::WebviewWindow) -> Result<(), String> {
    let monitor = overlay.current_monitor().map_err(|error| error.to_string())?
        .or(app.primary_monitor().map_err(|error| error.to_string())?)
        .ok_or_else(|| "current monitor is unavailable".to_owned())?;
    let work_area = monitor.work_area();
    let position = overlay_position(work_area.position, work_area.size, overlay.outer_size().map_err(|error| error.to_string())?);
    overlay.set_position(position).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::{overlay_position, VALID_MAIN_SCREENS};
    use tauri::{PhysicalPosition, PhysicalSize};
    #[test]
    fn positions_the_overlay_at_the_top_right_of_the_work_area() {
        assert_eq!(
            overlay_position(PhysicalPosition::new(0, 0), PhysicalSize::new(1920, 1056), PhysicalSize::new(400, 300)),
            PhysicalPosition::new(1496, 24),
        );
    }
    #[test]
    fn clamps_position_when_the_work_area_is_smaller_than_the_window() {
        assert_eq!(
            overlay_position(PhysicalPosition::new(1920, 0), PhysicalSize::new(200, 100), PhysicalSize::new(400, 300)),
            PhysicalPosition::new(1920, 0),
        );
    }
    #[test]
    fn preserves_monitor_origin_on_a_secondary_monitor() {
        assert_eq!(
            overlay_position(PhysicalPosition::new(-1280, 40), PhysicalSize::new(1280, 984), PhysicalSize::new(400, 300)),
            PhysicalPosition::new(-424, 64),
        );
    }
    #[test]
    fn accepts_goal_and_gap_main_window_screens() {
        assert!(VALID_MAIN_SCREENS.contains(&"goal"));
        assert!(VALID_MAIN_SCREENS.contains(&"gap"));
    }
    #[test]
    fn rejects_unknown_main_window_screens() {
        assert!(!VALID_MAIN_SCREENS.contains(&"not-a-screen"));
    }
}
