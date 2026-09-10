use std::io;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

const SYSTEM_ACCENT_READ_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Clone, Copy)]
pub(crate) struct ShellPlatformAuthority;

impl ShellPlatformAuthority {
    pub(crate) const fn new() -> Self {
        Self
    }

    pub(crate) async fn get_system_accent_color(&self) -> Option<String> {
        let (executable, arguments) = system_accent_command()?;
        let mut command = tokio::process::Command::new(executable);
        command
            .args(arguments)
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(windows_sys::Win32::System::Threading::CREATE_NO_WINDOW);
        let output = tokio::time::timeout(SYSTEM_ACCENT_READ_TIMEOUT, command.output())
            .await
            .ok()?
            .ok()?;
        if !output.status.success() {
            return None;
        }
        normalize_hex_color(&String::from_utf8_lossy(&output.stdout))
    }

    pub(crate) async fn open_path(&self, path: &str) {
        let _ = self.open_in_file_manager(path).await;
    }

    pub(crate) async fn open_in_file_manager(&self, path: &str) -> serde_json::Value {
        let Some(target) = validate_local_path(path).await else {
            return serde_json::json!({
                "ok": false,
                "reason": if Path::new(path).is_absolute() { "not-found" } else { "not-absolute" }
            });
        };
        let launched = detached(system_open_arguments(&target, true)).is_ok();
        if launched {
            serde_json::json!({ "ok": true })
        } else {
            serde_json::json!({ "ok": false, "reason": "launch-failed" })
        }
    }

    pub(crate) async fn open_in_external_editor(
        &self,
        path: &str,
        command: Option<&str>,
        connection_id: Option<&str>,
    ) -> serde_json::Value {
        if connection_id.is_some_and(|value| !value.trim().is_empty()) {
            return serde_json::json!({ "ok": false, "reason": "remote-runtime-unsupported" });
        }
        let Some(target) = validate_local_path(path).await else {
            return serde_json::json!({
                "ok": false,
                "reason": if Path::new(path).is_absolute() { "not-found" } else { "not-absolute" }
            });
        };
        let editor = command
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("code");
        if detached(editor_arguments(editor, &target)).is_ok() {
            serde_json::json!({ "ok": true })
        } else {
            serde_json::json!({ "ok": false, "reason": "launch-failed" })
        }
    }

    pub(crate) async fn open_file_path(&self, path: &str) -> bool {
        let Some(target) = validate_local_path(path).await else {
            return false;
        };
        detached(system_open_arguments(&target, false)).is_ok()
    }

    pub(crate) async fn open_file_uri(&self, uri: &str) {
        let Ok(parsed) = url::Url::parse(uri) else {
            return;
        };
        if parsed.scheme() != "file"
            || parsed
                .host_str()
                .is_some_and(|host| !host.is_empty() && host != "localhost")
        {
            return;
        }
        if let Ok(path) = parsed.to_file_path() {
            let _ = self.open_file_path(&path.to_string_lossy()).await;
        }
    }

    pub(crate) async fn path_exists(&self, path: &str) -> bool {
        tokio::fs::metadata(path).await.is_ok()
    }

    pub(crate) async fn pick_file(&self, kind: FileKind) -> Option<String> {
        pick_file(kind).await
    }

    pub(crate) async fn pick_directory(&self) -> Option<String> {
        tokio::task::spawn_blocking(|| {
            crate::native_messaging::pick_project_directories(false)
                .ok()
                .and_then(|paths| paths.into_iter().next())
        })
        .await
        .ok()
        .flatten()
    }
}

fn system_accent_command() -> Option<(&'static str, Vec<&'static str>)> {
    #[cfg(target_os = "macos")]
    {
        const SCRIPT: &str = "ObjC.import('AppKit'); (() => { const color = $.NSColor.controlAccentColor.colorUsingColorSpace($.NSColorSpace.sRGBColorSpace); if (!color) return ''; const byte = value => Math.max(0, Math.min(255, Math.round(value * 255))).toString(16).padStart(2, '0'); return '#' + byte(color.redComponent) + byte(color.greenComponent) + byte(color.blueComponent); })()";
        Some(("/usr/bin/osascript", vec!["-l", "JavaScript", "-e", SCRIPT]))
    }
    #[cfg(target_os = "windows")]
    {
        const SCRIPT: &str = "$settings = [Windows.UI.ViewManagement.UISettings,Windows.UI.ViewManagement,ContentType=WindowsRuntime]::new(); $accent = $settings.GetColorValue([Windows.UI.ViewManagement.UIColorType]::Accent); [Console]::Write(('#{0:x2}{1:x2}{2:x2}' -f $accent.R, $accent.G, $accent.B))";
        Some((
            "powershell.exe",
            vec![
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                SCRIPT,
            ],
        ))
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    None
}

fn normalize_hex_color(value: &str) -> Option<String> {
    let color = value.trim().to_ascii_lowercase();
    (color.len() == 7
        && color.starts_with('#')
        && color[1..].bytes().all(|byte| byte.is_ascii_hexdigit()))
    .then_some(color)
}

#[derive(Clone, Copy)]
pub(crate) enum FileKind {
    Attachment,
    Image,
    Audio,
}

async fn validate_local_path(path: &str) -> Option<String> {
    let path = PathBuf::from(path);
    if !path.is_absolute() {
        return None;
    }
    tokio::fs::metadata(&path)
        .await
        .ok()
        .map(|_| path.to_string_lossy().into_owned())
}

fn system_open_arguments(target: &str, reveal: bool) -> Vec<String> {
    if cfg!(target_os = "macos") {
        if reveal {
            vec!["open".into(), "-R".into(), target.into()]
        } else {
            vec!["open".into(), target.into()]
        }
    } else if cfg!(target_os = "windows") {
        if reveal {
            vec!["explorer.exe".into(), format!("/select,{target}")]
        } else {
            vec!["explorer.exe".into(), target.into()]
        }
    } else {
        vec![
            "xdg-open".into(),
            if reveal {
                Path::new(target)
                    .parent()
                    .unwrap_or_else(|| Path::new(target))
                    .to_string_lossy()
                    .into_owned()
            } else {
                target.into()
            },
        ]
    }
}

fn editor_arguments(command: &str, target: &str) -> Vec<String> {
    if command.contains(char::is_whitespace) {
        if cfg!(target_os = "windows") {
            let powershell = find_executable("pwsh.exe")
                .or_else(|| find_executable("powershell.exe"))
                .unwrap_or_else(|| "powershell.exe".into());
            vec![
                powershell,
                "-NoProfile".into(),
                "-Command".into(),
                "& ([scriptblock]::Create($args[0])) $args[1]".into(),
                command.into(),
                target.into(),
            ]
        } else {
            vec![
                "/bin/sh".into(),
                "-c".into(),
                format!("{command} \"$1\""),
                "agentstart-editor".into(),
                target.into(),
            ]
        }
    } else {
        let executable = if Path::new(command).is_absolute() {
            Some(command.to_owned())
        } else {
            find_executable(command)
        };
        let Some(executable) = executable else {
            return vec![String::new()];
        };
        let mut args = vec![executable];
        if Path::new(command)
            .file_stem()
            .and_then(|value| value.to_str())
            .is_some_and(|name| name.eq_ignore_ascii_case("cursor"))
        {
            args.push("--new-window".into());
        }
        args.push(target.into());
        args
    }
}

fn detached(arguments: Vec<String>) -> Result<(), io::Error> {
    let Some((executable, args)) = arguments.split_first() else {
        return Err(io::Error::other("empty command"));
    };
    if executable.is_empty() {
        return Err(io::Error::other("missing executable"));
    }
    let mut command = tokio::process::Command::new(executable);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let mut child = command.spawn()?;
    tokio::spawn(async move {
        let _ = child.wait().await;
    });
    Ok(())
}

fn find_executable(name: &str) -> Option<String> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|directory| directory.join(name))
        .find(|candidate| candidate.is_file())
        .map(|path| path.to_string_lossy().into_owned())
}

async fn pick_file(kind: FileKind) -> Option<String> {
    let prompt = "Choose a file for AgentStart";
    if cfg!(target_os = "macos") {
        let script = format!("POSIX path of (choose file with prompt {prompt:?})");
        return picker_output("osascript", ["-e", script.as_str()]).await;
    }
    if cfg!(target_os = "windows") {
        let powershell =
            find_executable("pwsh.exe").or_else(|| find_executable("powershell.exe"))?;
        return picker_output(&powershell, ["-STA", "-NoProfile", "-Command", "Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.OpenFileDialog; $dialog.Title = $args[0]; if ($dialog.ShowDialog() -eq 'OK') { [Console]::Write($dialog.FileName) }", prompt]).await;
    }
    if let Some(zenity) = find_executable("zenity") {
        let filter = match kind {
            FileKind::Image => "Images | *.png *.jpg *.jpeg *.gif *.webp *.svg *.bmp *.ico",
            FileKind::Audio => "Audio | *.ogg *.mp3 *.wav *.m4a *.aac *.flac",
            FileKind::Attachment => "",
        };
        let args = if filter.is_empty() {
            vec!["--file-selection".into(), format!("--title={prompt}")]
        } else {
            vec![
                "--file-selection".into(),
                format!("--title={prompt}"),
                format!("--file-filter={filter}"),
            ]
        };
        return picker_output_owned(&zenity, args).await;
    }
    let kdialog = find_executable("kdialog")?;
    picker_output(&kdialog, ["--getopenfilename", ".", "*"]).await
}

async fn picker_output<'a, I>(executable: &str, args: I) -> Option<String>
where
    I: IntoIterator<Item = &'a str>,
{
    picker_output_owned(executable, args.into_iter().map(str::to_owned).collect()).await
}

async fn picker_output_owned(executable: &str, args: Vec<String>) -> Option<String> {
    let output = tokio::process::Command::new(executable)
        .args(args)
        .output()
        .await
        .ok()?;
    output
        .status
        .success()
        .then(|| {
            String::from_utf8_lossy(&output.stdout)
                .trim()
                .trim_end_matches(['/', '\\'])
                .to_owned()
        })
        .filter(|value| !value.is_empty())
}
