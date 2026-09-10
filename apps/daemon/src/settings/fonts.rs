use std::collections::BTreeSet;
use std::process::Stdio;
use std::sync::OnceLock;
use std::time::Duration;

#[cfg(target_os = "macos")]
use serde_json::Value;
use tokio::io::AsyncReadExt;
use tokio::sync::Mutex;

static CACHE: OnceLock<Mutex<Option<Vec<String>>>> = OnceLock::new();

pub(super) async fn list() -> Vec<String> {
    let cache = CACHE.get_or_init(|| Mutex::new(None));
    let mut value = cache.lock().await;
    if let Some(fonts) = value.as_ref() {
        return fonts.clone();
    }
    let fonts = load().await.unwrap_or_else(fallback);
    let fonts = if fonts.is_empty() { fallback() } else { fonts };
    *value = Some(fonts.clone());
    fonts
}

async fn load() -> Option<Vec<String>> {
    #[cfg(target_os = "macos")]
    {
        let text = capture(
            "system_profiler",
            &["SPFontsDataType", "-json"],
            32 * 1024 * 1024,
            Duration::from_secs(45),
        )
        .await?;
        let root = serde_json::from_slice::<Value>(&text).ok()?;
        let values = root
            .get("SPFontsDataType")?
            .as_array()?
            .iter()
            .flat_map(|font| {
                font.get("typefaces")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
            })
            .filter_map(|face| face.get("family").and_then(Value::as_str));
        Some(unique(values))
    }
    #[cfg(target_os = "windows")]
    {
        let script = "Add-Type -AssemblyName System.Drawing; $fonts = New-Object System.Drawing.Text.InstalledFontCollection; $fonts.Families | ForEach-Object { $_.Name }";
        let text = capture(
            "powershell.exe",
            &[
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                script,
            ],
            8 * 1024 * 1024,
            Duration::from_secs(15),
        )
        .await?;
        Some(unique(String::from_utf8_lossy(&text).lines()))
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let text = capture(
            "fc-list",
            &[":", "family"],
            8 * 1024 * 1024,
            Duration::from_secs(15),
        )
        .await?;
        let text = String::from_utf8_lossy(&text);
        Some(unique(text.lines().flat_map(|line| line.split(','))))
    }
}

async fn capture(
    command: &str,
    args: &[&str],
    maximum: usize,
    deadline: Duration,
) -> Option<Vec<u8>> {
    let mut command = tokio::process::Command::new(command);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(windows_sys::Win32::System::Threading::CREATE_NO_WINDOW);
    let mut child = command.spawn().ok()?;
    let stdout = child.stdout.take()?;
    let future = async move {
        let mut bytes = Vec::new();
        stdout
            .take(u64::try_from(maximum).ok()? + 1)
            .read_to_end(&mut bytes)
            .await
            .ok()?;
        let status = child.wait().await.ok()?;
        (status.success() && bytes.len() <= maximum).then_some(bytes)
    };
    tokio::time::timeout(deadline, future).await.ok().flatten()
}

fn unique<'a>(values: impl Iterator<Item = &'a str>) -> Vec<String> {
    let mut values = BTreeSet::from_iter(values.filter_map(|value| {
        let value = value.trim();
        (!value.is_empty() && !value.starts_with('.')).then(|| value.to_owned())
    }))
    .into_iter()
    .collect::<Vec<_>>();
    values.sort_by(|left, right| {
        left.to_lowercase()
            .cmp(&right.to_lowercase())
            .then_with(|| left.cmp(right))
    });
    values
}

fn fallback() -> Vec<String> {
    let values: &[&str] = if cfg!(target_os = "macos") {
        &["SF Mono", "Menlo", "Monaco", "JetBrains Mono", "Fira Code"]
    } else if cfg!(target_os = "windows") {
        &[
            "Cascadia Mono",
            "Consolas",
            "Lucida Console",
            "JetBrains Mono",
            "Fira Code",
        ]
    } else {
        &[
            "JetBrains Mono",
            "Fira Code",
            "DejaVu Sans Mono",
            "Liberation Mono",
            "Ubuntu Mono",
            "Noto Sans Mono",
        ]
    };
    values.iter().map(|value| (*value).to_owned()).collect()
}
