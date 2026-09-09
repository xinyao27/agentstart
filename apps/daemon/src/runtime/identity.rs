use std::time::{SystemTime, UNIX_EPOCH};

use super::RuntimeFault;

#[derive(Clone)]
pub struct RuntimeIdentity {
    runtime_id: String,
    started_at: i64,
}

impl RuntimeIdentity {
    pub(super) fn generate() -> Result<Self, RuntimeFault> {
        let mut bytes = [0_u8; 16];
        getrandom::fill(&mut bytes).map_err(RuntimeFault::new)?;
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        let runtime_id = format!(
            "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
            bytes[0],
            bytes[1],
            bytes[2],
            bytes[3],
            bytes[4],
            bytes[5],
            bytes[6],
            bytes[7],
            bytes[8],
            bytes[9],
            bytes[10],
            bytes[11],
            bytes[12],
            bytes[13],
            bytes[14],
            bytes[15]
        );
        let started_at = i64::try_from(
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(RuntimeFault::new)?
                .as_millis(),
        )
        .map_err(RuntimeFault::new)?;
        Ok(Self {
            runtime_id,
            started_at,
        })
    }

    pub fn runtime_id(&self) -> &str {
        &self.runtime_id
    }

    pub fn started_at(&self) -> i64 {
        self.started_at
    }
}
