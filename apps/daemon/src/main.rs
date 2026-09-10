#![forbid(unsafe_code)]

use std::process::ExitCode;

const DAEMON_WORKER_THREADS: usize = 4;

fn main() -> ExitCode {
    let invocation = agentstart_daemon::entry::Invocation::parse(std::env::args_os());
    let restart_parent = invocation
        .waits_for_restart_parent()
        .then(agentstart_daemon::entry::restart_parent_pid)
        .flatten();
    if restart_parent.is_none()
        && let Some(result) = agentstart_daemon::entry::run_immediate(&invocation)
    {
        return result;
    }
    let mut runtime_builder = tokio::runtime::Builder::new_multi_thread();
    runtime_builder.enable_all();
    if matches!(&invocation, agentstart_daemon::entry::Invocation::Daemon(_)) {
        runtime_builder.worker_threads(DAEMON_WORKER_THREADS);
    }
    let runtime = match runtime_builder.build() {
        Ok(runtime) => runtime,
        Err(error) => {
            eprintln!("[daemon] Failed to create runtime executor: {error}");
            return ExitCode::FAILURE;
        }
    };
    runtime.block_on(agentstart_daemon::entry::run(invocation, restart_parent))
}
