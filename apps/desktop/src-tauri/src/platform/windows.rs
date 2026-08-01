use crate::models::RawWindowSnapshot;

#[derive(Debug, PartialEq, Eq)]
pub enum ObservationError {
    UnsupportedPlatform,
    Platform(String),
}

pub struct WindowsObservationSource;

impl WindowsObservationSource {
    #[cfg(not(windows))]
    pub fn read_snapshot(&self) -> Result<Option<RawWindowSnapshot>, ObservationError> {
        Err(ObservationError::UnsupportedPlatform)
    }

    #[cfg(windows)]
    pub fn read_snapshot(&self) -> Result<Option<RawWindowSnapshot>, ObservationError> {
        use std::path::Path;
        use windows::{
            core::PWSTR,
            Win32::{
                Foundation::CloseHandle,
                System::{
                    SystemInformation::GetTickCount,
                    Threading::{
                        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
                        PROCESS_QUERY_LIMITED_INFORMATION,
                    },
                },
                UI::{
                    Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO},
                    WindowsAndMessaging::{
                        GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW,
                        GetWindowThreadProcessId,
                    },
                },
            },
        };

        unsafe {
            let window = GetForegroundWindow();
            if window.0.is_null() {
                return Ok(None);
            }

            let title_length = GetWindowTextLengthW(window);
            if title_length <= 0 {
                return Ok(None);
            }

            let mut title_buffer = vec![0u16; title_length as usize + 1];
            let copied = GetWindowTextW(window, &mut title_buffer);
            let title = String::from_utf16_lossy(&title_buffer[..copied as usize]);
            let Some(window_title) = normalize_title(&title) else {
                return Ok(None);
            };

            let mut process_id = 0;
            GetWindowThreadProcessId(window, Some(&mut process_id));
            let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id)
                .map_err(|error| ObservationError::Platform(error.to_string()))?;

            let mut path_buffer = vec![0u16; 32_768];
            let mut path_length = path_buffer.len() as u32;
            let image_result = QueryFullProcessImageNameW(
                process,
                PROCESS_NAME_WIN32,
                PWSTR(path_buffer.as_mut_ptr()),
                &mut path_length,
            );
            let _ = CloseHandle(process);
            image_result.map_err(|error| ObservationError::Platform(error.to_string()))?;

            let process_path = String::from_utf16_lossy(&path_buffer[..path_length as usize]);
            let application_name = Path::new(&process_path)
                .file_stem()
                .and_then(|name| name.to_str())
                .unwrap_or("Unknown")
                .to_owned();

            let mut last_input = LASTINPUTINFO {
                cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
                dwTime: 0,
            };
            GetLastInputInfo(&mut last_input)
                .ok()
                .map_err(|error| ObservationError::Platform(error.to_string()))?;
            let idle_milliseconds = GetTickCount().wrapping_sub(last_input.dwTime);

            Ok(Some(RawWindowSnapshot {
                application_name,
                window_title,
                idle_seconds: (idle_milliseconds / 1_000) as u64,
            }))
        }
    }
}

pub fn normalize_title(title: &str) -> Option<String> {
    let normalized = title.trim();
    (!normalized.is_empty()).then(|| normalized.to_owned())
}
