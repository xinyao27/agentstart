use crate::hosts::{ExecutionHost, HostFileKind, HostFilesystem, HostKind};

use super::super::accumulator;
use super::super::model::{AiVaultAgent, AiVaultScanIssue, SessionCandidate};
use super::super::parser;
use super::{issue, now_iso, roots};

pub(super) async fn discover_databases(
    host: &dyn ExecutionHost,
    filesystem: &HostFilesystem,
    home: &str,
    candidates: &mut Vec<SessionCandidate>,
    issues: &mut Vec<AiVaultScanIssue>,
) {
    let data_root = roots::opencode_data_root(host.kind(), home, filesystem);
    let entries = match filesystem.read_dir(&data_root).await {
        Ok(entries) => entries,
        Err(_) => return,
    };
    for entry in entries
        .into_iter()
        .filter(|entry| entry.kind == HostFileKind::File && is_opencode_database(&entry.name))
    {
        let path = filesystem.paths().join(&[&data_root, &entry.name]);
        let rows = if host.kind() == HostKind::Local {
            let owned = path.clone();
            tokio::task::spawn_blocking(move || {
                parser::opencode::list_local(&owned, super::LIMIT_PER_AGENT)
            })
            .await
            .map_err(|error| parser::ParseError::OpenCode(error.to_string()))
            .and_then(std::convert::identity)
        } else {
            parser::opencode::list_remote(host, &path, super::LIMIT_PER_AGENT).await
        };
        match rows {
            Ok(rows) => {
                for (session_id, modified_at_ms) in rows {
                    candidates.push(SessionCandidate {
                        agent: AiVaultAgent::Opencode,
                        codex_home: None,
                        modified_at: accumulator::timestamp_iso(modified_at_ms)
                            .unwrap_or_else(now_iso),
                        modified_at_ms,
                        path: format!("{path}#session:{session_id}"),
                        size_bytes: 0,
                    });
                }
            }
            Err(error) => issues.push(issue(
                host.id(),
                AiVaultAgent::Opencode,
                &path,
                &error.to_string(),
            )),
        }
    }
}

fn is_opencode_database(name: &str) -> bool {
    let lowercase = name.to_ascii_lowercase();
    lowercase.starts_with("opencode")
        && lowercase.ends_with(".db")
        && lowercase["opencode".len()..lowercase.len() - ".db".len()]
            .chars()
            .all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
            })
}
