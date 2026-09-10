use std::env;
use std::ffi::OsString;
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
#[cfg(windows)]
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use thiserror::Error;

pub(super) const EXTENSION_ORIGIN: &str = "chrome-extension://mfgmfiabfncmdekmikepemddejoeihbf";
const NATIVE_HOST_NAME: &str = "com.agentstart.daemon";

#[derive(Serialize)]
struct NativeHostManifest<'a> {
    allowed_origins: [&'a str; 1],
    description: &'static str,
    name: &'static str,
    path: &'a str,
    #[serde(rename = "type")]
    transport_type: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InstallOutput<'a> {
    ok: bool,
    manifest_path: &'a str,
    extension_origin: &'static str,
}

#[derive(Debug, Error)]
pub(crate) enum NativeMessagingInstallError {
    #[cfg(windows)]
    #[error("APPDATA is required to install native messaging")]
    AppDataUnavailable,
    #[cfg(not(windows))]
    #[error("home directory is required to install native messaging")]
    HomeUnavailable,
    #[cfg(windows)]
    #[error("native_messaging_registry_failed")]
    RegistryFailed,
    #[error("native messaging manifest path is not valid Unicode")]
    NonUnicodePath,
    #[error("native messaging installation I/O failed: {0}")]
    Io(#[from] io::Error),
    #[error("native messaging manifest serialization failed: {0}")]
    Json(#[from] serde_json::Error),
}

pub(crate) fn install(args: &[OsString]) -> Result<(), NativeMessagingInstallError> {
    let manifest_path = resolve_manifest_path()?;
    let executable_path = env::current_exe()?;
    let executable = path_text(&executable_path)?;
    let allowed_origin = format!("{EXTENSION_ORIGIN}/");
    let manifest = NativeHostManifest {
        allowed_origins: [&allowed_origin],
        description: "Starts and connects the local AgentStart daemon",
        name: NATIVE_HOST_NAME,
        path: executable,
        transport_type: "stdio",
    };
    let mut contents = serde_json::to_string_pretty(&manifest)?;
    contents.push('\n');
    write_secure_file(&manifest_path, contents.as_bytes())?;
    register_windows_host(&manifest_path)?;

    if has_flag(args, "--silent") {
        return Ok(());
    }
    let manifest_path_text = path_text(&manifest_path)?;
    if has_flag(args, "--json") {
        println!(
            "{}",
            serde_json::to_string(&InstallOutput {
                ok: true,
                manifest_path: manifest_path_text,
                extension_origin: EXTENSION_ORIGIN,
            })?
        );
    } else {
        println!("AgentStart native messaging host installed: {manifest_path_text}");
    }
    Ok(())
}

fn resolve_manifest_path() -> Result<PathBuf, NativeMessagingInstallError> {
    if let Some(configured_root) = trimmed_environment("AGENTSTART_NATIVE_MESSAGING_CONFIG_ROOT") {
        return Ok(absolute_path(&configured_root)?.join(format!("{NATIVE_HOST_NAME}.json")));
    }
    #[cfg(target_os = "macos")]
    {
        Ok(home_directory()?
            .join("Library")
            .join("Application Support")
            .join("Google")
            .join("Chrome")
            .join("NativeMessagingHosts")
            .join(format!("{NATIVE_HOST_NAME}.json")))
    }
    #[cfg(target_os = "windows")]
    {
        let app_data = trimmed_environment("LOCALAPPDATA")
            .or_else(|| trimmed_environment("APPDATA"))
            .ok_or(NativeMessagingInstallError::AppDataUnavailable)?;
        Ok(PathBuf::from(app_data)
            .join("AgentStart")
            .join("NativeMessagingHosts")
            .join(format!("{NATIVE_HOST_NAME}.json")))
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let config_root = trimmed_environment("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .unwrap_or(home_directory()?.join(".config"));
        Ok(config_root
            .join("google-chrome")
            .join("NativeMessagingHosts")
            .join(format!("{NATIVE_HOST_NAME}.json")))
    }
}

fn write_secure_file(path: &Path, contents: &[u8]) -> Result<(), NativeMessagingInstallError> {
    let directory = path.parent().ok_or_else(|| {
        io::Error::new(io::ErrorKind::InvalidInput, "manifest path has no parent")
    })?;
    fs::create_dir_all(directory)?;
    harden_path(directory, true)?;
    let temporary_path = temporary_path(path);
    let result = (|| {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temporary_path)?;
        file.write_all(contents)?;
        file.flush()?;
        harden_path(&temporary_path, false)?;
        fs::rename(&temporary_path, path)?;
        harden_path(path, false)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    result
}

fn temporary_path(path: &Path) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(NATIVE_HOST_NAME);
    path.with_file_name(format!("{file_name}.{}.{nonce}.tmp", std::process::id()))
}

#[cfg(unix)]
fn harden_path(path: &Path, is_directory: bool) -> Result<(), NativeMessagingInstallError> {
    use std::os::unix::fs::PermissionsExt;

    let mode = if is_directory { 0o700 } else { 0o600 };
    fs::set_permissions(path, fs::Permissions::from_mode(mode))?;
    Ok(())
}

#[cfg(windows)]
fn harden_path(path: &Path, _is_directory: bool) -> Result<(), NativeMessagingInstallError> {
    let sid = windows_user_sid()?;
    let output = Command::new(windows_system_executable("icacls.exe"))
        .arg(path)
        .args([
            "/inheritance:r",
            "/grant:r",
            &format!("*{sid}:(F)"),
            "/c",
            "/q",
        ])
        .output()?;
    if !output.status.success() {
        return Err(NativeMessagingInstallError::Io(io::Error::other(
            "daemon_secure_file_acl_failed",
        )));
    }
    Ok(())
}

#[cfg(windows)]
fn windows_user_sid() -> Result<String, NativeMessagingInstallError> {
    let output = Command::new(windows_system_executable("whoami.exe"))
        .args(["/user", "/fo", "csv", "/nh"])
        .output()?;
    if output.status.success() {
        let text = String::from_utf8_lossy(&output.stdout);
        if let Some(sid) = text
            .split('"')
            .find(|value| value.starts_with("S-") && value[2..].contains('-'))
        {
            return Ok(sid.to_owned());
        }
    }
    Err(NativeMessagingInstallError::Io(io::Error::other(
        "daemon_windows_user_sid_unavailable",
    )))
}

#[cfg(windows)]
fn register_windows_host(path: &Path) -> Result<(), NativeMessagingInstallError> {
    let output = Command::new("reg.exe")
        .args([
            "ADD",
            &format!("HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\{NATIVE_HOST_NAME}"),
            "/ve",
            "/t",
            "REG_SZ",
            "/d",
        ])
        .arg(path)
        .arg("/f")
        .output()?;
    if !output.status.success() {
        return Err(NativeMessagingInstallError::RegistryFailed);
    }
    Ok(())
}

#[cfg(not(windows))]
fn register_windows_host(_path: &Path) -> Result<(), NativeMessagingInstallError> {
    Ok(())
}

#[cfg(windows)]
fn windows_system_executable(name: &str) -> PathBuf {
    trimmed_environment("SystemRoot")
        .map(PathBuf::from)
        .map(|root| root.join("System32").join(name))
        .unwrap_or_else(|| PathBuf::from(name))
}

#[cfg(not(windows))]
fn home_directory() -> Result<PathBuf, NativeMessagingInstallError> {
    trimmed_environment("HOME")
        .or_else(|| trimmed_environment("USERPROFILE"))
        .map(PathBuf::from)
        .ok_or(NativeMessagingInstallError::HomeUnavailable)
}

fn trimmed_environment(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn absolute_path(path: &str) -> Result<PathBuf, NativeMessagingInstallError> {
    let path = PathBuf::from(path);
    if path.is_absolute() {
        Ok(path)
    } else {
        Ok(env::current_dir()?.join(path))
    }
}

fn path_text(path: &Path) -> Result<&str, NativeMessagingInstallError> {
    path.to_str()
        .ok_or(NativeMessagingInstallError::NonUnicodePath)
}

fn has_flag(args: &[OsString], flag: &str) -> bool {
    args.iter().any(|argument| argument == flag)
}
