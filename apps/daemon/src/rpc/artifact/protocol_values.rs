// Why: the proto types alias to a `Proto` prefix because the authority's
// record types carry the same names and the conversions read best when the
// Rust side keeps its canonical spelling.
use yiru_protocol::runtime::v1::{
    Artifact as ProtoArtifact, ArtifactDownloadTicket as ProtoArtifactDownloadTicket,
    ArtifactRead as ProtoArtifactRead, ArtifactStatus as ProtoArtifactStatus,
};

use crate::persistence::{Artifact, ArtifactDownloadTicket, ArtifactRead, ArtifactStatus};

pub(in crate::rpc) fn protocol_artifact(artifact: &Artifact) -> ProtoArtifact {
    ProtoArtifact {
        byte_length: artifact.byte_length,
        created_at: artifact.created_at,
        file_name: artifact.file_name.clone(),
        id: artifact.id.clone(),
        mime_type: artifact.mime_type.clone(),
        project_id: artifact.project_id.clone(),
        status: match artifact.status {
            ArtifactStatus::Ready => ProtoArtifactStatus::Ready,
            ArtifactStatus::Writing => ProtoArtifactStatus::Writing,
        } as i32,
    }
}

pub(in crate::rpc) fn protocol_read(read: &ArtifactRead) -> ProtoArtifactRead {
    ProtoArtifactRead {
        data_base64: read.data_base64.clone(),
        eof: read.eof,
        mime_type: read.mime_type.clone(),
        next_offset: read.next_offset,
    }
}

pub(in crate::rpc) fn protocol_ticket(
    ticket: &ArtifactDownloadTicket,
) -> ProtoArtifactDownloadTicket {
    ProtoArtifactDownloadTicket {
        expires_at: ticket.expires_at,
        ticket: ticket.ticket.clone(),
    }
}
