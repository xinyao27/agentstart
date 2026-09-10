mod supervisor;

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use serde::Deserialize;

use crate::hosts::{HostCommand, HostCommandErrorKind, HostPlatform};

use super::{NotebookRunError, NotebookRunResult, NotebookTarget};

const PYTHON_RUN_TIMEOUT_MS: u64 = 60_000;
const SUPERVISOR_TIMEOUT_MS: u64 = PYTHON_RUN_TIMEOUT_MS + 5_000;
const MAX_CAPTURE_BYTES: usize = 2 * 1_024 * 1_024;
const MAX_SUPERVISOR_OUTPUT_BYTES: usize = (MAX_CAPTURE_BYTES * 2).div_ceil(3) * 4 + 64 * 1_024;
const RESULT_PREFIX: &str = "AGENTSTART_NOTEBOOK_RESULT_V1:";
const TRUNCATION_MARKER: &str = "\n[output truncated]\n";

struct PythonCandidate {
    args_prefix: Vec<String>,
    command: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SupervisorResult {
    exit_code: Option<i32>,
    launch_error: Option<String>,
    stderr_base64: String,
    stderr_truncated: bool,
    stdout_base64: String,
    stdout_truncated: bool,
    timed_out: bool,
}

enum CandidateResult {
    Missing(String),
    Complete(NotebookRunResult),
}

pub(super) async fn run(
    target: NotebookTarget,
    code: String,
    preamble: String,
) -> Result<NotebookRunResult, NotebookRunError> {
    let execution_code = build_execution_code(&code, &preamble)?;
    let mut last_error = "Python was not found.".to_owned();
    for candidate in python_candidates(target.host.platform()) {
        match run_candidate(&target, candidate, &execution_code).await? {
            CandidateResult::Missing(error) => last_error = error,
            CandidateResult::Complete(result) => return Ok(result),
        }
    }
    Ok(NotebookRunResult {
        stdout: String::new(),
        stderr: String::new(),
        exit_code: None,
        error: Some(last_error),
    })
}

async fn run_candidate(
    target: &NotebookTarget,
    candidate: PythonCandidate,
    execution_code: &str,
) -> Result<CandidateResult, NotebookRunError> {
    let mut command = HostCommand::new(
        &candidate.command,
        candidate
            .args_prefix
            .iter()
            .cloned()
            .chain(["-c".to_owned(), supervisor::SOURCE.to_owned()]),
    );
    command.cwd = Some(target.cwd.clone());
    command.max_output_bytes = Some(MAX_SUPERVISOR_OUTPUT_BYTES);
    command.stdin = Some(serde_json::to_vec(&serde_json::json!({
        "executionCode": execution_code
    }))?);
    command.timeout_ms = Some(SUPERVISOR_TIMEOUT_MS);
    let output = match target.host.exec(command).await {
        Ok(output) => output,
        Err(error) if is_missing_spawn(&error) => {
            return Ok(CandidateResult::Missing(error.to_string()));
        }
        Err(error) if error.kind() == HostCommandErrorKind::Timeout => {
            return Ok(CandidateResult::Complete(timeout_result()));
        }
        Err(error) => return Err(error.into()),
    };
    let Some(payload) = output.stdout.strip_prefix(RESULT_PREFIX) else {
        if is_missing_remote_command(output.exit_code, &output.stderr) {
            return Ok(CandidateResult::Missing(output.stderr));
        }
        return Ok(CandidateResult::Complete(NotebookRunResult {
            stdout: output.stdout,
            stderr: output.stderr,
            exit_code: (output.exit_code >= 0).then_some(output.exit_code),
            error: None,
        }));
    };
    let result = serde_json::from_str::<SupervisorResult>(payload.trim_end())?;
    Ok(CandidateResult::Complete(decode_result(result)?))
}

fn decode_result(result: SupervisorResult) -> Result<NotebookRunResult, NotebookRunError> {
    let mut stdout = String::from_utf8_lossy(
        &BASE64
            .decode(result.stdout_base64)
            .map_err(|_| NotebookRunError::InvalidInterpreterResponse)?,
    )
    .into_owned();
    let mut stderr = String::from_utf8_lossy(
        &BASE64
            .decode(result.stderr_base64)
            .map_err(|_| NotebookRunError::InvalidInterpreterResponse)?,
    )
    .into_owned();
    if result.stdout_truncated {
        stdout.push_str(TRUNCATION_MARKER);
    }
    if result.stderr_truncated {
        stderr.push_str(TRUNCATION_MARKER);
    }
    Ok(NotebookRunResult {
        stdout,
        stderr,
        exit_code: result.exit_code,
        error: if result.timed_out {
            Some("Python cell timed out.".to_owned())
        } else {
            result.launch_error
        },
    })
}

fn timeout_result() -> NotebookRunResult {
    NotebookRunResult {
        stdout: String::new(),
        stderr: String::new(),
        exit_code: None,
        error: Some("Python cell timed out.".to_owned()),
    }
}

fn python_candidates(platform: HostPlatform) -> Vec<PythonCandidate> {
    let mut candidates = Vec::new();
    if let Ok(configured) = std::env::var("AGENTSTART_NOTEBOOK_PYTHON") {
        let configured = configured.trim_matches(super::is_ecmascript_whitespace);
        if !configured.is_empty() {
            candidates.push(PythonCandidate {
                args_prefix: Vec::new(),
                command: configured.to_owned(),
            });
        }
    }
    if platform == HostPlatform::Windows {
        candidates.push(PythonCandidate {
            args_prefix: vec!["-3".to_owned()],
            command: "py".to_owned(),
        });
    }
    candidates.extend([
        PythonCandidate {
            args_prefix: Vec::new(),
            command: "python3".to_owned(),
        },
        PythonCandidate {
            args_prefix: Vec::new(),
            command: "python".to_owned(),
        },
    ]);
    candidates
}

fn build_execution_code(code: &str, preamble: &str) -> Result<String, serde_json::Error> {
    let payload = BASE64.encode(serde_json::to_vec(&serde_json::json!({
        "code": code,
        "preamble": preamble
    }))?);
    Ok([
        "import base64, contextlib, io, json, sys, traceback".to_owned(),
        format!("payload = json.loads(base64.b64decode({payload:?}).decode(\"utf-8\"))"),
        "namespace = {\"__name__\": \"__main__\"}".to_owned(),
        "try:".to_owned(),
        "    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):".to_owned(),
        "        exec(payload[\"preamble\"], namespace)".to_owned(),
        "    exec(payload[\"code\"], namespace)".to_owned(),
        "except Exception:".to_owned(),
        "    traceback.print_exc()".to_owned(),
        "    sys.exit(1)".to_owned(),
    ]
    .join("\n"))
}

fn is_missing_spawn(error: &crate::hosts::HostCommandError) -> bool {
    if error.kind() != HostCommandErrorKind::Spawn {
        return false;
    }
    let message = error.to_string().to_ascii_lowercase();
    message.contains("os error 2")
        || message.contains("no such file or directory")
        || message.contains("cannot find the file")
        || message.contains("program not found")
}

fn is_missing_remote_command(exit_code: i32, stderr: &str) -> bool {
    if exit_code != 127 {
        return false;
    }
    let stderr = stderr.to_ascii_lowercase();
    stderr.contains("not found") || stderr.contains("no such file or directory")
}
