use std::collections::HashMap;

use super::model::{ExecutionHost, HostCommand, HostCommandError, HostCommandOutput};
use super::port_adapter::PORT_SCAN_MAX_OUTPUT_BYTES;
use super::port_parse::{ProcessMetadata, dedupe, nonempty, parse_proc_net};
use crate::workspace_ports::RawWorkspacePort;

const SCAN_TIMEOUT_MS: u64 = 4_000;
const PROC_NET_COMMAND: &str =
    r#"for file in /proc/net/tcp /proc/net/tcp6; do [ ! -r "$file" ] || cat -- "$file"; done"#;

pub(super) async fn scan(
    host: &dyn ExecutionHost,
) -> Result<Vec<RawWorkspacePort>, HostCommandError> {
    let sockets = parse_proc_net(&successful(
        host.exec(shell_command(PROC_NET_COMMAND)).await?,
        "linux port table scan failed",
    )?);
    if sockets.is_empty() {
        return Ok(Vec::new());
    }
    let wanted = sockets
        .iter()
        .map(|(_, _, inode)| inode.to_string())
        .collect::<Vec<_>>()
        .join(" ");
    let output = successful(
        host.exec(shell_command(build_process_script(&wanted)))
            .await?,
        "linux process scan failed",
    )?;
    let (pids, metadata) = parse_process_rows(&output);
    Ok(dedupe(
        sockets
            .into_iter()
            .map(|(bind_host, port, inode)| {
                let pid = pids.get(&inode).copied();
                let process = pid.and_then(|pid| metadata.get(&pid));
                RawWorkspacePort {
                    bind_host,
                    command_line: process.and_then(|value| value.command_line.clone()),
                    cwd: process.and_then(|value| value.cwd.clone()),
                    pid,
                    port,
                    process_name: process.and_then(|value| value.process_name.clone()),
                }
            })
            .collect(),
    ))
}

fn shell_command(script: impl Into<String>) -> HostCommand {
    let mut command = HostCommand::new("sh", ["-lc".to_owned(), script.into()]);
    command.max_output_bytes = Some(PORT_SCAN_MAX_OUTPUT_BYTES);
    command.timeout_ms = Some(SCAN_TIMEOUT_MS);
    command
}

fn successful(
    output: HostCommandOutput,
    fallback: &'static str,
) -> Result<String, HostCommandError> {
    if output.exit_code == 0 {
        Ok(output.stdout)
    } else {
        Err(super::model::failed_command(output, fallback))
    }
}

fn build_process_script(wanted: &str) -> String {
    format!(
        r#"wanted=' {wanted} '
for proc in /proc/[0-9]*; do
  pid=${{proc##*/}}; matched=0
  for fd in "$proc"/fd/*; do
    link=$(readlink "$fd" 2>/dev/null) || continue
    case "$link" in socket:\[*\]) inode=${{link#socket:\[}}; inode=${{inode%\]}};; *) continue;; esac
    case "$wanted" in *" $inode "*) printf 'P\t%s\t%s\n' "$inode" "$pid"; matched=1;; esac
  done
  if [ "$matched" -eq 1 ]; then
    comm=$(head -c 4096 "$proc/comm" 2>/dev/null | tr '\t\r\n' '   ')
    cmd=$(tr '\000\t\r\n' '    ' < "$proc/cmdline" 2>/dev/null | head -c 65536)
    cwd=$(readlink "$proc/cwd" 2>/dev/null | tr '\t\r\n' '   ')
    printf 'M\t%s\t%s\t%s\t%s\n' "$pid" "$comm" "$cmd" "$cwd"
  fi
done"#
    )
}

fn parse_process_rows(output: &str) -> (HashMap<u64, u32>, HashMap<u32, ProcessMetadata>) {
    let mut pids = HashMap::new();
    let mut metadata = HashMap::new();
    for line in output.lines() {
        let fields = line.splitn(5, '\t').collect::<Vec<_>>();
        match fields.as_slice() {
            ["P", inode, pid] => {
                if let (Ok(inode), Ok(pid)) = (inode.parse(), pid.parse()) {
                    pids.insert(inode, pid);
                }
            }
            ["M", pid, name, command, cwd] => {
                if let Ok(pid) = pid.parse() {
                    metadata.insert(
                        pid,
                        ProcessMetadata {
                            command_line: nonempty(command),
                            cwd: nonempty(cwd),
                            process_name: nonempty(name),
                        },
                    );
                }
            }
            _ => {}
        }
    }
    (pids, metadata)
}
