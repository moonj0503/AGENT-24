use std::{
    collections::HashMap,
    hash::{DefaultHasher, Hash, Hasher},
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, SystemTime},
};

use serde::Serialize;

const MAX_SCREENSHOTS_PER_SESSION: usize = 30;
const SCREENSHOT_RETENTION: Duration = Duration::from_secs(24 * 60 * 60);

pub struct ScreenshotState {
    root: PathBuf,
    last_hashes: Mutex<HashMap<String, u64>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotCaptureResult {
    captured: bool,
    path: Option<String>,
}

impl ScreenshotState {
    pub fn new(root: PathBuf) -> Self {
        Self { root, last_hashes: Mutex::new(HashMap::new()) }
    }

    fn save(&self, work_session_id: &str, bytes: Vec<u8>) -> Result<ScreenshotCaptureResult, String> {
        let session = safe_identifier(work_session_id)?;
        let mut hasher = DefaultHasher::new();
        bytes.hash(&mut hasher);
        let hash = hasher.finish();
        let mut last_hashes = self.last_hashes.lock().map_err(|_| "screenshot state is unavailable".to_owned())?;
        if last_hashes.get(&session) == Some(&hash) {
            return Ok(ScreenshotCaptureResult { captured: false, path: None });
        }

        let directory = self.root.join(&session);
        std::fs::create_dir_all(&directory).map_err(|_| "screenshot directory could not be created".to_owned())?;
        prune_screenshots(&directory)?;
        let timestamp = chrono::Utc::now().format("%Y%m%dT%H%M%S%.3fZ");
        let path = directory.join(format!("capture-{timestamp}-{hash:016x}.bmp"));
        std::fs::write(&path, bytes).map_err(|_| "screenshot could not be saved".to_owned())?;
        last_hashes.insert(session, hash);
        prune_screenshots(&directory)?;
        Ok(ScreenshotCaptureResult { captured: true, path: Some(path.to_string_lossy().into_owned()) })
    }
}

#[tauri::command]
pub fn capture_observation_screenshot(
    work_session_id: String,
    state: tauri::State<'_, ScreenshotState>,
    observer: tauri::State<'_, crate::commands::activity::ObserverState>,
) -> Result<ScreenshotCaptureResult, String> {
    if !observer.capture_allowed()? {
        return Ok(ScreenshotCaptureResult { captured: false, path: None });
    }
    state.save(&work_session_id, capture_desktop_bitmap()?)
}

fn safe_identifier(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > 128 || !trimmed.chars().all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_')) {
        return Err("work session identifier is invalid".to_owned());
    }
    Ok(trimmed.to_owned())
}

fn prune_screenshots(directory: &Path) -> Result<(), String> {
    let now = SystemTime::now();
    let mut files = std::fs::read_dir(directory)
        .map_err(|_| "screenshot directory could not be read".to_owned())?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let metadata = entry.metadata().ok()?;
            metadata.is_file().then(|| (entry.path(), metadata.modified().ok()))
        })
        .collect::<Vec<_>>();
    for (path, modified) in &files {
        if modified.and_then(|value| now.duration_since(value).ok()).is_some_and(|age| age > SCREENSHOT_RETENTION) {
            let _ = std::fs::remove_file(path);
        }
    }
    files.retain(|(path, _)| path.exists());
    files.sort_by_key(|(_, modified)| *modified);
    let excess = files.len().saturating_sub(MAX_SCREENSHOTS_PER_SESSION);
    for (path, _) in files.into_iter().take(excess) {
        let _ = std::fs::remove_file(path);
    }
    Ok(())
}

#[cfg(not(windows))]
fn capture_desktop_bitmap() -> Result<Vec<u8>, String> {
    Err("desktop screenshots are available only on Windows".to_owned())
}

#[cfg(windows)]
fn capture_desktop_bitmap() -> Result<Vec<u8>, String> {
    use windows::Win32::{
        Graphics::Gdi::{
            BitBlt, CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetWindowDC,
            ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
            DIB_RGB_COLORS, HGDIOBJ, SRCCOPY,
        },
        UI::WindowsAndMessaging::{
            GetForegroundWindow, GetWindowRect,
        },
    };

    unsafe {
        let desktop_window = GetForegroundWindow();
        if desktop_window.0.is_null() { return Err("foreground window is unavailable".to_owned()); }
        let mut bounds = windows::Win32::Foundation::RECT::default();
        GetWindowRect(desktop_window, &mut bounds).map_err(|_| "foreground window dimensions are unavailable".to_owned())?;
        let width = bounds.right - bounds.left;
        let height = bounds.bottom - bounds.top;
        if width <= 0 || height <= 0 { return Err("foreground window dimensions are unavailable".to_owned()); }
        let screen_dc = GetWindowDC(Some(desktop_window));
        if screen_dc.0.is_null() { return Err("desktop capture could not start".to_owned()); }
        let memory_dc = CreateCompatibleDC(Some(screen_dc));
        if memory_dc.0.is_null() {
            let _ = ReleaseDC(Some(desktop_window), screen_dc);
            return Err("desktop capture resources are unavailable".to_owned());
        }
        let row_bytes = ((width as usize * 32 + 31) / 32) * 4;
        let pixel_size = row_bytes * height as usize;
        let bitmap_info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                biSizeImage: pixel_size as u32,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut pixel_pointer = std::ptr::null_mut();
        let bitmap = match CreateDIBSection(Some(screen_dc), &bitmap_info, DIB_RGB_COLORS, &mut pixel_pointer, None, 0) {
            Ok(bitmap) => bitmap,
            Err(_) => {
                let _ = DeleteDC(memory_dc);
                let _ = ReleaseDC(Some(desktop_window), screen_dc);
                return Err("desktop capture resources are unavailable".to_owned());
            }
        };
        if bitmap.0.is_null() || pixel_pointer.is_null() {
            let _ = DeleteDC(memory_dc);
            let _ = ReleaseDC(Some(desktop_window), screen_dc);
            return Err("desktop capture resources are unavailable".to_owned());
        }
        let previous = SelectObject(memory_dc, HGDIOBJ(bitmap.0));
        if previous.0.is_null() {
            let _ = DeleteObject(HGDIOBJ(bitmap.0));
            let _ = DeleteDC(memory_dc);
            let _ = ReleaseDC(Some(desktop_window), screen_dc);
            return Err("desktop capture bitmap could not be selected".to_owned());
        }
        let capture_result = BitBlt(memory_dc, 0, 0, width, height, Some(screen_dc), 0, 0, SRCCOPY);
        let capture_error = capture_result.as_ref().err().map(ToString::to_string);
        let pixels = if capture_result.is_ok() {
            std::slice::from_raw_parts(pixel_pointer.cast::<u8>(), pixel_size).to_vec()
        } else { Vec::new() };
        let _ = SelectObject(memory_dc, previous);
        let _ = DeleteObject(HGDIOBJ(bitmap.0));
        let _ = DeleteDC(memory_dc);
        let _ = ReleaseDC(Some(desktop_window), screen_dc);
        if pixels.is_empty() { return Err(capture_error.map_or_else(|| "desktop pixels could not be captured".to_owned(), |error| format!("desktop pixels could not be captured: {error}"))); }

        let pixel_offset = 14u32 + std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        let file_size = pixel_offset + pixel_size as u32;
        let mut output = Vec::with_capacity(file_size as usize);
        output.extend_from_slice(b"BM");
        output.extend_from_slice(&file_size.to_le_bytes());
        output.extend_from_slice(&[0u8; 4]);
        output.extend_from_slice(&pixel_offset.to_le_bytes());
        output.extend_from_slice(std::slice::from_raw_parts(
            (&bitmap_info.bmiHeader as *const BITMAPINFOHEADER).cast::<u8>(),
            std::mem::size_of::<BITMAPINFOHEADER>(),
        ));
        output.extend_from_slice(&pixels);
        Ok(output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_identifiers_cannot_escape_the_capture_directory() {
        assert!(safe_identifier("session-123").is_ok());
        assert!(safe_identifier("../outside").is_err());
        assert!(safe_identifier("a/b").is_err());
    }

    #[test]
    fn deduplicates_consecutive_frames_and_enforces_the_session_limit() {
        let root = std::env::temp_dir().join(format!("continuity-screenshots-{}", uuid::Uuid::new_v4()));
        let state = ScreenshotState::new(root.clone());
        assert!(state.save("session-1", vec![1, 2, 3]).unwrap().captured);
        assert!(!state.save("session-1", vec![1, 2, 3]).unwrap().captured);
        for value in 0..=MAX_SCREENSHOTS_PER_SESSION {
            state.save("session-1", vec![value as u8, 4, 5]).unwrap();
        }
        let count = std::fs::read_dir(root.join("session-1")).unwrap().count();
        assert_eq!(count, MAX_SCREENSHOTS_PER_SESSION);
        let _ = std::fs::remove_dir_all(root);
    }

}
