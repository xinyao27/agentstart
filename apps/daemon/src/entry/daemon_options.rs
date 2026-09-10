use std::ffi::OsString;
use std::path::{Path, PathBuf};

use thiserror::Error;

use crate::paths::{resolve_default_user_data_path, resolve_user_data_path};

const DEFAULT_MOBILE_PORT: u16 = 6768;

#[derive(Debug)]
pub(super) struct DaemonOptions {
    pub dev_supervisor: bool,
    pub json: bool,
    pub listen_address: String,
    pub mobile_pairing: bool,
    pub mobile_port: u16,
    pub pairing_address: Option<String>,
    pub rpc_port: u16,
    pub user_data_path: PathBuf,
}

#[derive(Debug, Error)]
pub(super) enum DaemonArgumentError {
    #[error("Unknown runtime host option: {0}")]
    UnknownOption(String),
    #[error("`{0}` requires a value")]
    MissingValue(&'static str),
    #[error("Invalid runtime host port: {0}")]
    InvalidPort(String),
    #[error("`--pairing-address` requires `--mobile-pairing`")]
    PairingRequiresMobile,
    #[error("runtime host argument is not valid Unicode")]
    NonUnicode,
    #[error(transparent)]
    Path(#[from] crate::paths::PathResolutionError),
}

pub(super) fn parse(args: &[OsString]) -> Result<DaemonOptions, DaemonArgumentError> {
    let mut dev_supervisor = false;
    let mut json = false;
    let mut listen_address = "127.0.0.1".to_owned();
    let mut mobile_pairing = false;
    let mut mobile_port = DEFAULT_MOBILE_PORT;
    let mut pairing_address = None;
    let mut rpc_port = 0;
    let mut user_data_path = None;
    let mut index = 0;
    while index < args.len() {
        let argument = text(&args[index])?;
        match argument {
            "--json" => json = true,
            "--listen" => {
                listen_address = option_value(args, index, "--listen")?.to_owned();
                index += 1;
            }
            "--mobile-pairing" => {
                mobile_pairing = true;
            }
            "--pairing-address" => {
                pairing_address = Some(option_value(args, index, "--pairing-address")?.to_owned());
                index += 1;
            }
            "--port" => {
                let raw_port = option_value(args, index, "--port")?;
                mobile_port = parse_port(raw_port)?;
                index += 1;
            }
            "--rpc-port" => {
                rpc_port = parse_port(option_value(args, index, "--rpc-port")?)?;
                index += 1;
            }
            "--user-data-path" => {
                user_data_path = Some(option_value(args, index, "--user-data-path")?.to_owned());
                index += 1;
            }
            "--dev-supervisor-token" => {
                // Why: supervisors need incarnation tokens in argv so they can bind a runtime to
                // the exact process they launched across a crash or a service-manager boundary.
                let _token = option_value(args, index, "--runtime-ownership-token")?;
                dev_supervisor = true;
                index += 1;
            }
            "--service-instance-token" => {
                let _token = option_value(args, index, "--runtime-ownership-token")?;
                index += 1;
            }
            value => return Err(DaemonArgumentError::UnknownOption(value.to_owned())),
        }
        index += 1;
    }
    if pairing_address.is_some() && !mobile_pairing {
        return Err(DaemonArgumentError::PairingRequiresMobile);
    }
    let user_data_path = match user_data_path {
        Some(path) => resolve_user_data_path(Path::new(&path))?,
        None => resolve_default_user_data_path()?,
    };
    Ok(DaemonOptions {
        dev_supervisor,
        json,
        listen_address,
        mobile_pairing,
        mobile_port,
        pairing_address,
        rpc_port,
        user_data_path,
    })
}

fn option_value<'a>(
    args: &'a [OsString],
    index: usize,
    option: &'static str,
) -> Result<&'a str, DaemonArgumentError> {
    let value = args
        .get(index + 1)
        .ok_or(DaemonArgumentError::MissingValue(option))?;
    let value = text(value)?;
    if value.is_empty() || value.starts_with('-') {
        return Err(DaemonArgumentError::MissingValue(option));
    }
    Ok(value)
}

fn parse_port(raw_port: &str) -> Result<u16, DaemonArgumentError> {
    let numeric = raw_port
        .parse::<f64>()
        .map_err(|_| DaemonArgumentError::InvalidPort(raw_port.to_owned()))?;
    if !numeric.is_finite() || numeric.fract() != 0.0 || !(0.0..=65535.0).contains(&numeric) {
        return Err(DaemonArgumentError::InvalidPort(raw_port.to_owned()));
    }
    Ok(numeric as u16)
}

fn text(value: &OsString) -> Result<&str, DaemonArgumentError> {
    value.to_str().ok_or(DaemonArgumentError::NonUnicode)
}
