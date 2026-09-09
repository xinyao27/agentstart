use std::collections::{HashMap, HashSet};

use super::model::{ExecutionHost, HostCommand, HostCommandError};
use super::port_adapter::PORT_SCAN_MAX_OUTPUT_BYTES;
use super::port_parse::{ProcessMetadata, nonempty, parse_lsof};
use crate::workspace_ports::RawWorkspacePort;

const SCAN_TIMEOUT_MS: u64 = 4_000;

pub(super) async fn scan(
    host: &dyn ExecutionHost,
) -> Result<Vec<RawWorkspacePort>, HostCommandError> {
    let mut ports = parse_lsof(&required(
        host.exec(scan_command(
            "lsof",
            ["-nP", "-iTCP", "-sTCP:LISTEN", "-F", "pcn"],
        ))
        .await?,
        "darwin port scan failed",
    )?);
    let pids = ports
        .iter()
        .filter_map(|port| port.pid)
        .collect::<HashSet<_>>();
    if pids.is_empty() {
        return Ok(ports);
    }
    let pid_list = pids
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let cwd = scan_command("lsof", ["-a", "-p", &pid_list, "-d", "cwd", "-Fn"]);
    let commands = scan_command("ps", ["-p", &pid_list, "-o", "pid=", "-o", "command="]);
    let (cwd, commands) = tokio::join!(host.exec(cwd), host.exec(commands));
    let mut metadata = HashMap::new();
    if let Ok(output) = cwd
        && output.exit_code == 0
    {
        parse_cwds(&output.stdout, &mut metadata);
    }
    if let Ok(output) = commands
        && output.exit_code == 0
    {
        parse_commands(&output.stdout, &mut metadata);
    }
    for port in &mut ports {
        if let Some(process) = port.pid.and_then(|pid| metadata.get(&pid)) {
            port.cwd.clone_from(&process.cwd);
            port.command_line.clone_from(&process.command_line);
        }
    }
    Ok(ports)
}

fn scan_command<const N: usize>(command: &str, args: [&str; N]) -> HostCommand {
    let mut command = HostCommand::new(command, args);
    command.max_output_bytes = Some(PORT_SCAN_MAX_OUTPUT_BYTES);
    command.timeout_ms = Some(SCAN_TIMEOUT_MS);
    command
}

fn required(
    output: super::HostCommandOutput,
    fallback: &'static str,
) -> Result<String, HostCommandError> {
    if output.exit_code == 0 {
        Ok(output.stdout)
    } else {
        Err(super::model::failed_command(output, fallback))
    }
}

fn parse_cwds(output: &str, metadata: &mut HashMap<u32, ProcessMetadata>) {
    let mut current_pid = None;
    for line in output.lines() {
        let Some((tag, value)) = line.split_at_checked(1) else {
            continue;
        };
        if tag == "p" {
            current_pid = value.parse().ok();
        } else if tag == "n"
            && let Some(pid) = current_pid
        {
            metadata.entry(pid).or_default().cwd = nonempty(value);
        }
    }
}

fn parse_commands(output: &str, metadata: &mut HashMap<u32, ProcessMetadata>) {
    for line in output.lines() {
        let line = line.trim_start();
        let Some(offset) = line.find(char::is_whitespace) else {
            continue;
        };
        if let Ok(pid) = line[..offset].parse() {
            metadata.entry(pid).or_default().command_line = nonempty(line[offset..].trim());
        }
    }
}
