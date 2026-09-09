use super::{
    ArtifactDownloadTicket, ArtifactStore, ArtifactStoreError, DOWNLOAD_TICKET_TTL_MS,
    DownloadTicketEntry, MAX_DOWNLOAD_TICKETS, ReadyArtifactFile, now_millis,
};

impl ArtifactStore {
    pub(crate) async fn issue_download_ticket(
        &self,
        id: String,
    ) -> Result<ArtifactDownloadTicket, ArtifactStoreError> {
        let mut state = self.state.lock().await;
        self.initialize_locked(&mut state).await?;
        if self.ready_file_locked(id.clone()).await?.is_none() {
            return Err(ArtifactStoreError::NotFound);
        }
        let now = now_millis()?;
        let expires_at = now + DOWNLOAD_TICKET_TTL_MS;
        let ticket = random_ticket()?;
        state
            .download_tickets
            .retain(|_, entry| entry.expires_at >= now);
        while state.download_tickets.len() >= MAX_DOWNLOAD_TICKETS {
            let Some(oldest) = state
                .download_tickets
                .iter()
                .min_by_key(|(_, entry)| entry.expires_at)
                .map(|(ticket, _)| ticket.clone())
            else {
                break;
            };
            state.download_tickets.remove(&oldest);
        }
        state.download_tickets.insert(
            ticket.clone(),
            DownloadTicketEntry {
                artifact_id: id,
                expires_at,
            },
        );
        Ok(ArtifactDownloadTicket { expires_at, ticket })
    }

    pub(super) async fn consume_download_ticket(
        &self,
        id: String,
        ticket: Option<String>,
    ) -> Result<Option<ReadyArtifactFile>, ArtifactStoreError> {
        let mut state = self.state.lock().await;
        self.initialize_locked(&mut state).await?;
        let Some(ticket) = ticket.filter(|ticket| !ticket.is_empty()) else {
            return Ok(None);
        };
        let Some(entry) = state.download_tickets.remove(&ticket) else {
            return Ok(None);
        };
        if entry.artifact_id != id || entry.expires_at < now_millis()? {
            return Ok(None);
        }
        self.ready_file_locked(id).await
    }
}

fn random_ticket() -> Result<String, ArtifactStoreError> {
    let mut bytes = [0_u8; 24];
    getrandom::fill(&mut bytes)?;
    Ok(bytes
        .into_iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}
