#[cfg(not(target_os = "macos"))]
use std::fs;
use std::path::Path;
#[cfg(not(target_os = "macos"))]
use std::path::PathBuf;
use std::process::{Command, Stdio};

pub(crate) fn pick_project_directory() -> Result<Option<String>, &'static str> {
    pick_project_directories(false).map(|paths| paths.into_iter().next())
}

pub(crate) fn pick_project_directories(multiple: bool) -> Result<Vec<String>, &'static str> {
    #[cfg(target_os = "macos")]
    {
        let script = if multiple {
            "set chosenFolders to choose folder with prompt \"Choose a project for AgentStart\" with multiple selections allowed\nset resultText to \"\"\nrepeat with chosenFolder in chosenFolders\nset resultText to resultText & POSIX path of chosenFolder & linefeed\nend repeat\nreturn resultText"
        } else {
            "POSIX path of (choose folder with prompt \"Choose a project for AgentStart\")"
        };
        run_directory_picker("osascript", &["-e", script])
    }
    #[cfg(target_os = "windows")]
    {
        let _ = multiple;
        let executable = find_executable("pwsh.exe")
            .or_else(|| find_executable("powershell.exe"))
            .ok_or("directory_picker_unavailable")?;
        run_directory_picker(
            &executable,
            &[
                "-STA",
                "-NoProfile",
                "-Command",
                "Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description = 'Choose a project for AgentStart'; if ($dialog.ShowDialog() -eq 'OK') { [Console]::Write($dialog.SelectedPath) }",
            ],
        )
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        if let Some(executable) = find_executable("zenity") {
            let mut args = vec![
                "--file-selection",
                "--directory",
                "--title=Choose a project for AgentStart",
            ];
            if multiple {
                args.extend(["--multiple", "--separator=\n"]);
            }
            return run_directory_picker(&executable, &args);
        }
        let executable = find_executable("kdialog").ok_or("directory_picker_unavailable")?;
        let current_directory = std::env::current_dir()
            .map_err(|_| "directory_picker_unavailable")?
            .to_string_lossy()
            .into_owned();
        run_directory_picker(&executable, &["--getexistingdirectory", &current_directory])
    }
}

fn run_directory_picker(
    executable: impl AsRef<Path>,
    args: &[&str],
) -> Result<Vec<String>, &'static str> {
    let mut command = Command::new(executable.as_ref());
    command.args(args).stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        command.creation_flags(windows_sys::Win32::System::Threading::CREATE_NO_WINDOW);
    }
    let output = command
        .output()
        .map_err(|_| "directory_picker_unavailable")?;
    if !output.status.success() {
        return Ok(Vec::new());
    }
    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .map(trim_trailing_separator)
        .filter(|path| !path.is_empty())
        .map(str::to_owned)
        .collect())
}

fn trim_trailing_separator(path: &str) -> &str {
    path.trim_end_matches(['/', '\\'])
}

#[cfg(not(target_os = "macos"))]
fn find_executable(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|directory| directory.join(name))
        .find(|candidate| is_executable(candidate))
}

#[cfg(not(target_os = "macos"))]
fn is_executable(path: &Path) -> bool {
    let Ok(metadata) = fs::metadata(path) else {
        return false;
    };
    if !metadata.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        metadata.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}
