mod connection;
mod flags;
mod status;

use std::ffi::OsString;

use thiserror::Error;

#[derive(Debug, Error)]
pub(crate) enum CliError {
    #[error(transparent)]
    Bootstrap(#[from] crate::native_messaging::BootstrapError),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Path(#[from] crate::paths::PathResolutionError),
    #[error("{0}")]
    Unavailable(&'static str),
    #[error("{0}")]
    Unsupported(&'static str),
    #[error(transparent)]
    Url(#[from] url::ParseError),
}

pub(crate) fn run_connection(args: &[OsString]) -> Result<(), CliError> {
    connection::run(args)
}

pub(crate) fn run_status(args: &[OsString]) -> Result<(), CliError> {
    status::run(args)
}
