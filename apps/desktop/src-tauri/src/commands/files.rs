use std::path::PathBuf;

use serde::Serialize;

const MAX_EXPORT_BYTES: usize = 1_048_576;

pub struct FileToolState {
    root: PathBuf,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextFileWriteResult {
    path: String,
    updated: bool,
}

impl FileToolState {
    pub fn new(root: PathBuf) -> Self { Self { root } }

    fn write(&self, file_name: &str, content: &str) -> Result<TextFileWriteResult, String> {
        let file_name = validate_file_name(file_name)?;
        if content.as_bytes().len() > MAX_EXPORT_BYTES {
            return Err("export content exceeds the one-megabyte limit".to_owned());
        }
        std::fs::create_dir_all(&self.root).map_err(|_| "export directory could not be created".to_owned())?;
        let path = self.root.join(file_name);
        let updated = path.exists();
        std::fs::write(&path, content).map_err(|_| "artifact could not be exported".to_owned())?;
        Ok(TextFileWriteResult { path: path.to_string_lossy().into_owned(), updated })
    }
}

#[tauri::command]
pub fn write_text_file(
    file_name: String,
    content: String,
    state: tauri::State<'_, FileToolState>,
) -> Result<TextFileWriteResult, String> {
    state.write(&file_name, &content)
}

fn validate_file_name(value: &str) -> Result<&str, String> {
    let path = std::path::Path::new(value);
    let valid_extension = path.extension().and_then(|extension| extension.to_str()).is_some_and(|extension| matches!(extension.to_ascii_lowercase().as_str(), "txt" | "md"));
    let safe_characters = value.chars().all(|character| character.is_alphanumeric() || matches!(character, ' ' | '-' | '_' | '.'));
    let reserved = path.file_stem().and_then(|stem| stem.to_str()).is_some_and(|stem| {
        matches!(stem.to_ascii_uppercase().as_str(), "CON" | "PRN" | "AUX" | "NUL" | "COM1" | "COM2" | "COM3" | "COM4" | "COM5" | "COM6" | "COM7" | "COM8" | "COM9" | "LPT1" | "LPT2" | "LPT3" | "LPT4" | "LPT5" | "LPT6" | "LPT7" | "LPT8" | "LPT9")
    });
    if value.trim().is_empty() || value.len() > 180 || value.starts_with('.') || path.file_name().and_then(|name| name.to_str()) != Some(value) || !valid_extension || !safe_characters || reserved {
        return Err("only a plain .txt or .md file name is allowed".to_owned());
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_text_formats_and_rejects_paths() {
        assert_eq!(validate_file_name("draft.md"), Ok("draft.md"));
        assert_eq!(validate_file_name("notes.TXT"), Ok("notes.TXT"));
        assert!(validate_file_name("../draft.md").is_err());
        assert!(validate_file_name("draft:secret.md").is_err());
        assert!(validate_file_name("CON.txt").is_err());
        assert!(validate_file_name("draft.pdf").is_err());
    }

    #[test]
    fn writes_and_updates_only_inside_the_export_root() {
        let root = std::env::temp_dir().join(format!("continuity-file-tool-{}", uuid::Uuid::new_v4()));
        let state = FileToolState::new(root.clone());
        assert!(!state.write("draft.md", "first").unwrap().updated);
        assert!(state.write("draft.md", "second").unwrap().updated);
        assert_eq!(std::fs::read_to_string(root.join("draft.md")).unwrap(), "second");
        let _ = std::fs::remove_dir_all(root);
    }
}
