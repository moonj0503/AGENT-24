use tauri::{AppHandle, Emitter, Manager, PhysicalPosition};

pub const OVERLAY_LABEL: &str = "quick-overlay";
const OVERLAY_WIDTH: f64 = 400.0;
const OVERLAY_HEIGHT: f64 = 300.0;
const OVERLAY_MARGIN: f64 = 24.0;

#[derive(Debug, PartialEq)]
pub struct OverlayPosition { pub x: f64, pub y: f64 }

pub fn overlay_position(screen_width: f64, screen_height: f64) -> OverlayPosition {
    OverlayPosition { x: (screen_width - OVERLAY_WIDTH - OVERLAY_MARGIN).max(0.0), y: (screen_height - OVERLAY_HEIGHT - OVERLAY_MARGIN).max(0.0) }
}

#[tauri::command]
pub fn show_overlay(app: AppHandle) -> Result<(), String> {
    let overlay = overlay_window(&app)?;
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
    if !matches!(screen.as_str(), "dashboard" | "approval" | "recovery" | "settings") { return Err(format!("unsupported main-window screen: {screen}")); }
    let main = app.get_webview_window("main").ok_or_else(|| "main window is unavailable".to_owned())?;
    main.show().map_err(|error| error.to_string())?;
    main.set_focus().map_err(|error| error.to_string())?;
    main.emit("main.navigate", screen).map_err(|error| error.to_string())
}

fn overlay_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    app.get_webview_window(OVERLAY_LABEL).ok_or_else(|| "quick overlay window is unavailable".to_owned())
}

fn position_overlay_window(app: &AppHandle, overlay: &tauri::WebviewWindow) -> Result<(), String> {
    let monitor = app.primary_monitor().map_err(|error| error.to_string())?.ok_or_else(|| "primary monitor is unavailable".to_owned())?;
    let size = monitor.size();
    let origin = monitor.position();
    let position = overlay_position(f64::from(size.width), f64::from(size.height));
    overlay.set_position(PhysicalPosition::new(origin.x + position.x.round() as i32, origin.y + position.y.round() as i32)).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::{overlay_position, OverlayPosition};
    #[test]
    fn positions_the_overlay_with_a_bottom_right_margin() { assert_eq!(overlay_position(1920.0, 1080.0), OverlayPosition { x: 1496.0, y: 756.0 }); }
    #[test]
    fn clamps_position_on_a_smaller_screen() { assert_eq!(overlay_position(200.0, 100.0), OverlayPosition { x: 0.0, y: 0.0 }); }
}
