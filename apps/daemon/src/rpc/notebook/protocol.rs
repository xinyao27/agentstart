use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::{
    NotebookServiceRunPythonCellRequest, NotebookServiceRunPythonCellResponse,
};
use agentstart_protocol::transport::{decode, encode};

use crate::notebook::NotebookRunRequest;

use super::NotebookRpc;

pub(in crate::rpc) async fn run_python_cell(
    rpc: &NotebookRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<NotebookServiceRunPythonCellRequest>(payload)?;
    if request.file_path.is_empty() {
        return Err(invalid_argument("Missing filePath"));
    }
    let result = rpc
        .runner
        .run(NotebookRunRequest {
            code: request.code,
            file_path: request.file_path,
            preamble: request.preamble,
        })
        .await
        .map_err(|error| status(StatusCode::Internal, &error.to_string()))?;
    Ok(encode(&NotebookServiceRunPythonCellResponse {
        stdout: result.stdout,
        stderr: result.stderr,
        exit_code: result.exit_code,
        error: result.error,
    }))
}

fn invalid_argument(message: &str) -> Status {
    status(StatusCode::InvalidArgument, message)
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}
