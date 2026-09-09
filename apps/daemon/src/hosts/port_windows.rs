use std::collections::{HashMap, HashSet};

use serde_json::Value;

use super::model::{ExecutionHost, HostCommand, HostCommandError};
use super::port_adapter::PORT_SCAN_MAX_OUTPUT_BYTES;
use super::port_parse::{ProcessMetadata, nonempty, parse_netstat};
use crate::workspace_ports::RawWorkspacePort;

const SCAN_TIMEOUT_MS: u64 = 4_000;

pub(super) async fn scan(
    host: &dyn ExecutionHost,
) -> Result<Vec<RawWorkspacePort>, HostCommandError> {
    let mut command = HostCommand::new("netstat", ["-ano", "-p", "tcp"]);
    command.max_output_bytes = Some(PORT_SCAN_MAX_OUTPUT_BYTES);
    command.timeout_ms = Some(SCAN_TIMEOUT_MS);
    let output = host.exec(command).await?;
    if output.exit_code != 0 {
        return Err(super::model::failed_command(
            output,
            "windows port scan failed",
        ));
    }
    let mut ports = parse_netstat(&output.stdout);
    let pids = ports
        .iter()
        .filter_map(|port| port.pid)
        .collect::<HashSet<_>>();
    if pids.is_empty() {
        return Ok(ports);
    }
    if let Some(metadata) = load_metadata(host, &pids).await {
        for port in &mut ports {
            if let Some(process) = port.pid.and_then(|pid| metadata.get(&pid)) {
                port.command_line.clone_from(&process.command_line);
                port.process_name.clone_from(&process.process_name);
            }
        }
    }
    Ok(ports)
}

async fn load_metadata(
    host: &dyn ExecutionHost,
    pids: &HashSet<u32>,
) -> Option<HashMap<u32, ProcessMetadata>> {
    let filter = pids
        .iter()
        .map(|pid| format!("ProcessId={pid}"))
        .collect::<Vec<_>>()
        .join(" OR ");
    let script = format!(
        "Get-CimInstance Win32_Process -Filter \"{filter}\" | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress"
    );
    let mut command = HostCommand::new(
        "powershell.exe",
        ["-NoProfile".to_owned(), "-Command".to_owned(), script],
    );
    command.max_output_bytes = Some(PORT_SCAN_MAX_OUTPUT_BYTES);
    command.timeout_ms = Some(SCAN_TIMEOUT_MS);
    let output = host.exec(command).await.ok()?;
    if output.exit_code != 0 {
        return None;
    }
    let value = serde_json::from_str::<Value>(&output.stdout).ok()?;
    let rows = value
        .as_array()
        .map_or_else(|| vec![&value], |rows| rows.iter().collect());
    let mut metadata = HashMap::new();
    for row in rows {
        let Some(pid) = row
            .get("ProcessId")
            .and_then(Value::as_u64)
            .and_then(|pid| u32::try_from(pid).ok())
        else {
            continue;
        };
        if pids.contains(&pid) {
            metadata.insert(
                pid,
                ProcessMetadata {
                    command_line: row
                        .get("CommandLine")
                        .and_then(Value::as_str)
                        .and_then(nonempty),
                    cwd: None,
                    process_name: row.get("Name").and_then(Value::as_str).and_then(nonempty),
                },
            );
        }
    }
    Some(metadata)
}
