use crate::{models::RawWindowSnapshot, platform::ObservationError};

#[derive(Default)]
pub struct MockObservationSource;

impl MockObservationSource {
    pub fn read_snapshot(&self) -> Result<Option<RawWindowSnapshot>, ObservationError> {
        Ok(Some(RawWindowSnapshot {
            application_name: "WINWORD.EXE".into(),
            window_title: "Quarterly plan 010-1234-5678".into(),
            idle_seconds: 0,
        }))
    }
}
