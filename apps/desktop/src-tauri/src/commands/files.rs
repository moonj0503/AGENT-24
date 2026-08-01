use std::{fs, path::{Path, PathBuf}};

use serde::{Deserialize, Serialize};

const MAX_TEXT_BYTES: usize = 1_048_576;

pub struct FileToolState { root: PathBuf, approvals_path: PathBuf, backups_root: PathBuf }

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextFileWriteResult { path: String, updated: bool }

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FileApprovalScope { Gap, Always }

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovedTextFile { authorization_id: String, path: String, file_name: String, scope: FileApprovalScope, identity: String }

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovedTextFileContext { authorization_id: String, file_name: String, content: String }

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextPatchResult { authorization_id: String, path: String, backup_path: String, before: String, after: String, summary: String }

impl FileToolState {
    pub fn new(root: PathBuf, app_data: PathBuf) -> Self {
        Self { root, approvals_path: app_data.join("file-authorizations.json"), backups_root: app_data.join("file-backups") }
    }

    fn write(&self, file_name: &str, content: &str) -> Result<TextFileWriteResult, String> {
        let file_name = validate_file_name(file_name)?;
        validate_size(content)?;
        fs::create_dir_all(&self.root).map_err(|_| "export directory could not be created".to_owned())?;
        let path = self.root.join(file_name);
        let updated = path.exists();
        fs::write(&path, content).map_err(|_| "artifact could not be exported".to_owned())?;
        Ok(TextFileWriteResult { path: path.to_string_lossy().into_owned(), updated })
    }

    fn authorize(&self, path: &str, scope: FileApprovalScope) -> Result<ApprovedTextFile, String> {
        let canonical = canonical_text_path(path)?;
        let metadata = fs::metadata(&canonical).map_err(|_| "file metadata could not be read".to_owned())?;
        if metadata.len() > MAX_TEXT_BYTES as u64 { return Err("file exceeds the one-megabyte limit".to_owned()); }
        let approved = ApprovedTextFile {
            authorization_id: uuid::Uuid::new_v4().to_string(),
            path: canonical.to_string_lossy().into_owned(),
            file_name: canonical.file_name().and_then(|value| value.to_str()).ok_or("file name is not valid UTF-8")?.to_owned(),
            scope,
            identity: file_identity(&canonical)?,
        };
        let mut approvals = self.load()?;
        approvals.retain(|item| item.path != approved.path);
        approvals.push(approved.clone());
        self.save(&approvals)?;
        Ok(approved)
    }

    fn context(&self, authorization_id: &str) -> Result<ApprovedTextFileContext, String> {
        let approved = self.require_current(authorization_id)?;
        let content = fs::read_to_string(&approved.path).map_err(|_| "approved file must contain UTF-8 text".to_owned())?;
        validate_size(&content)?;
        Ok(ApprovedTextFileContext { authorization_id: approved.authorization_id, file_name: approved.file_name, content })
    }

    fn apply(&self, authorization_id: &str, find: &str, replace: &str) -> Result<TextPatchResult, String> {
        if find.is_empty() { return Err("patch search text cannot be empty".to_owned()); }
        if find.len() > 65_536 || replace.len() > 65_536 { return Err("patch exceeds the 64-kilobyte edit limit".to_owned()); }
        let approved = self.require_current(authorization_id)?;
        let before = fs::read_to_string(&approved.path).map_err(|_| "approved file must contain UTF-8 text".to_owned())?;
        if before.matches(find).count() != 1 { return Err("patch search text must occur exactly once".to_owned()); }
        let after = before.replacen(find, replace, 1);
        validate_size(&after)?;
        fs::create_dir_all(&self.backups_root).map_err(|_| "backup directory could not be created".to_owned())?;
        let backup_path = self.backups_root.join(format!("{}-{}", uuid::Uuid::new_v4(), approved.file_name));
        fs::copy(&approved.path, &backup_path).map_err(|_| "backup could not be created".to_owned())?;
        fs::write(&approved.path, &after).map_err(|_| "approved file could not be updated".to_owned())?;
        self.refresh_identity(&approved.authorization_id)?;
        Ok(TextPatchResult {
            authorization_id: approved.authorization_id,
            path: approved.path,
            backup_path: backup_path.to_string_lossy().into_owned(),
            before: find.to_owned(),
            after: replace.to_owned(),
            summary: "Applied one bounded text replacement to the approved file.".to_owned(),
        })
    }

    fn require_current(&self, authorization_id: &str) -> Result<ApprovedTextFile, String> {
        let approved = self.load()?.into_iter().find(|item| item.authorization_id == authorization_id).ok_or("file authorization was not found")?;
        let canonical = canonical_text_path(&approved.path)?;
        if canonical.to_string_lossy() != approved.path { return Err("the approved file path has changed".to_owned()); }
        if file_identity(&canonical)? != approved.identity { return Err("the approved file was moved or replaced; authorize it again".to_owned()); }
        Ok(approved)
    }

    fn refresh_identity(&self, authorization_id: &str) -> Result<(), String> {
        let mut approvals = self.load()?;
        let approved = approvals.iter_mut().find(|item| item.authorization_id == authorization_id).ok_or("file authorization was not found")?;
        approved.identity = file_identity(Path::new(&approved.path))?;
        self.save(&approvals)
    }

    fn load(&self) -> Result<Vec<ApprovedTextFile>, String> {
        if !self.approvals_path.exists() { return Ok(Vec::new()); }
        serde_json::from_slice(&fs::read(&self.approvals_path).map_err(|_| "file authorizations could not be read".to_owned())?).map_err(|_| "file authorizations are invalid".to_owned())
    }
    fn save(&self, approvals: &[ApprovedTextFile]) -> Result<(), String> {
        if let Some(parent) = self.approvals_path.parent() { fs::create_dir_all(parent).map_err(|_| "authorization directory could not be created".to_owned())?; }
        fs::write(&self.approvals_path, serde_json::to_vec_pretty(approvals).map_err(|_| "file authorizations could not be encoded".to_owned())?).map_err(|_| "file authorizations could not be saved".to_owned())
    }
}

#[tauri::command]
pub fn write_text_file(file_name: String, content: String, state: tauri::State<'_, FileToolState>) -> Result<TextFileWriteResult, String> { state.write(&file_name, &content) }
#[tauri::command]
pub fn authorize_text_file(path: String, scope: FileApprovalScope, state: tauri::State<'_, FileToolState>) -> Result<ApprovedTextFile, String> { state.authorize(&path, scope) }
#[tauri::command]
pub fn list_approved_text_files(state: tauri::State<'_, FileToolState>) -> Result<Vec<ApprovedTextFile>, String> { state.load() }
#[tauri::command]
pub fn revoke_text_file_authorization(authorization_id: String, state: tauri::State<'_, FileToolState>) -> Result<(), String> { let mut approvals = state.load()?; approvals.retain(|item| item.authorization_id != authorization_id); state.save(&approvals) }
#[tauri::command]
pub fn read_approved_text_file(authorization_id: String, state: tauri::State<'_, FileToolState>) -> Result<ApprovedTextFileContext, String> { state.context(&authorization_id) }
#[tauri::command]
pub fn apply_approved_text_patch(authorization_id: String, find: String, replace: String, state: tauri::State<'_, FileToolState>) -> Result<TextPatchResult, String> { state.apply(&authorization_id, &find, &replace) }

fn validate_file_name(value: &str) -> Result<&str, String> {
    let path = Path::new(value);
    let valid_extension = path.extension().and_then(|extension| extension.to_str()).is_some_and(|extension| matches!(extension.to_ascii_lowercase().as_str(), "txt" | "md"));
    let safe_characters = value.chars().all(|character| character.is_alphanumeric() || matches!(character, ' ' | '-' | '_' | '.'));
    let reserved = path.file_stem().and_then(|stem| stem.to_str()).is_some_and(|stem| matches!(stem.to_ascii_uppercase().as_str(), "CON" | "PRN" | "AUX" | "NUL" | "COM1" | "COM2" | "COM3" | "COM4" | "COM5" | "COM6" | "COM7" | "COM8" | "COM9" | "LPT1" | "LPT2" | "LPT3" | "LPT4" | "LPT5" | "LPT6" | "LPT7" | "LPT8" | "LPT9"));
    if value.trim().is_empty() || value.len() > 180 || value.starts_with('.') || path.file_name().and_then(|name| name.to_str()) != Some(value) || !valid_extension || !safe_characters || reserved { return Err("only a plain .txt or .md file name is allowed".to_owned()); }
    Ok(value)
}

fn canonical_text_path(value: &str) -> Result<PathBuf, String> {
    let canonical = fs::canonicalize(value).map_err(|_| "select an existing saved file".to_owned())?;
    if !canonical.is_file() { return Err("select an existing saved file".to_owned()); }
    let extension = canonical.extension().and_then(|value| value.to_str()).unwrap_or_default().to_ascii_lowercase();
    if !matches!(extension.as_str(), "txt" | "md") { return Err("only .txt and .md files can be approved".to_owned()); }
    Ok(canonical)
}

fn validate_size(content: &str) -> Result<(), String> { if content.len() > MAX_TEXT_BYTES { Err("text exceeds the one-megabyte limit".to_owned()) } else { Ok(()) } }

#[cfg(windows)]
fn file_identity(path: &Path) -> Result<String, String> {
    use windows::{core::HSTRING, Win32::{Foundation::CloseHandle, Storage::FileSystem::{CreateFileW, GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION, FILE_ATTRIBUTE_NORMAL, FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING}}};
    let handle = unsafe { CreateFileW(&HSTRING::from(path.as_os_str()), 0, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, None, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, None) }.map_err(|_| "file identity could not be opened".to_owned())?;
    let mut info = BY_HANDLE_FILE_INFORMATION::default();
    let result = unsafe { GetFileInformationByHandle(handle, &mut info) };
    let _ = unsafe { CloseHandle(handle) };
    result.map_err(|_| "file identity could not be read".to_owned())?;
    Ok(format!("{}:{}:{}", info.dwVolumeSerialNumber, info.nFileIndexHigh, info.nFileIndexLow))
}
#[cfg(not(windows))]
fn file_identity(path: &Path) -> Result<String, String> { Ok(format!("{}", fs::metadata(path).map_err(|_| "file identity could not be read".to_owned())?.len())) }

#[cfg(test)]
mod tests {
    use super::*;
    fn state(root: &Path) -> FileToolState { FileToolState::new(root.join("exports"), root.to_owned()) }
    #[test]
    fn accepts_text_formats_and_rejects_paths() { assert_eq!(validate_file_name("draft.md"), Ok("draft.md")); assert!(validate_file_name("../draft.md").is_err()); assert!(validate_file_name("CON.txt").is_err()); assert!(validate_file_name("draft.pdf").is_err()); }
    #[test]
    fn authorizes_backs_up_and_patches_exactly_once() {
        let root = std::env::temp_dir().join(format!("continuity-file-tool-{}", uuid::Uuid::new_v4())); fs::create_dir_all(&root).unwrap();
        let file = root.join("notes.txt"); fs::write(&file, "one target three").unwrap(); let state = state(&root);
        let approved = state.authorize(file.to_str().unwrap(), FileApprovalScope::Gap).unwrap();
        let result = state.apply(&approved.authorization_id, "target", "finished").unwrap();
        assert_eq!(fs::read_to_string(file).unwrap(), "one finished three"); assert!(Path::new(&result.backup_path).exists());
        let _ = fs::remove_dir_all(root);
    }
    #[test]
    fn refuses_ambiguous_patch() {
        let root = std::env::temp_dir().join(format!("continuity-file-tool-{}", uuid::Uuid::new_v4())); fs::create_dir_all(&root).unwrap();
        let file = root.join("notes.md"); fs::write(&file, "same same").unwrap(); let state = state(&root);
        let approved = state.authorize(file.to_str().unwrap(), FileApprovalScope::Always).unwrap();
        assert!(state.apply(&approved.authorization_id, "same", "new").is_err()); let _ = fs::remove_dir_all(root);
    }
    #[test]
    fn replacing_an_approved_file_invalidates_authorization() {
        let root = std::env::temp_dir().join(format!("continuity-file-tool-{}", uuid::Uuid::new_v4())); fs::create_dir_all(&root).unwrap();
        let file = root.join("notes.txt"); fs::write(&file, "original").unwrap(); let state = state(&root);
        let approved = state.authorize(file.to_str().unwrap(), FileApprovalScope::Gap).unwrap();
        fs::remove_file(&file).unwrap(); fs::write(&file, "replacement").unwrap();
        assert!(state.context(&approved.authorization_id).is_err()); let _ = fs::remove_dir_all(root);
    }
}
