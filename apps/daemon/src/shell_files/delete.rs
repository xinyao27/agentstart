use crate::hosts::{HostCommand, HostFilesystem, HostKind, HostPlatform, HostRemoveOptions};
use crate::workspace_paths::PathResolution;

use super::{ShellFileError, ShellFiles};

impl ShellFiles {
    pub(crate) async fn delete(
        &self,
        target_path: &str,
        recursive: bool,
    ) -> Result<(), ShellFileError> {
        let target = self
            .authority
            .resolve(target_path, PathResolution::PreserveLeaf)
            .await?;
        let filesystem = HostFilesystem::new(target.host.clone());
        if filesystem.stat(&target.path).await?.is_none() {
            return Ok(());
        }
        if target.host.kind() != HostKind::Local {
            filesystem
                .remove(
                    &target.path,
                    HostRemoveOptions {
                        force: true,
                        recursive,
                    },
                )
                .await?;
            return Ok(());
        }
        let command = trash_command(target.host.platform(), &target.path);
        let output = target.host.exec(command).await?;
        if output.exit_code == 0 {
            Ok(())
        } else {
            Err(ShellFileError::Operation("system_trash_failed".to_owned()))
        }
    }
}

fn trash_command(platform: HostPlatform, target_path: &str) -> HostCommand {
    match platform {
        // Why: Finder coerces aliases by following symlinks. NSFileManager trashes the directory
        // entry itself, preserving the authorization contract for delete.
        HostPlatform::Darwin => HostCommand::new(
            "osascript",
            [
                "-l",
                "JavaScript",
                "-e",
                "ObjC.import('Foundation'); function run(argv) { const url = $.NSURL.fileURLWithPath(argv[0]); const resulting = Ref(); const error = Ref(); if (!$.NSFileManager.defaultManager.trashItemAtURLResultingItemURLError(url, resulting, error)) { throw Error(ObjC.unwrap(error[0].localizedDescription)); } }",
                target_path,
            ],
        ),
        HostPlatform::Windows => {
            let script = "Add-Type -AssemblyName Microsoft.VisualBasic; $p=$args[0]; if ([IO.Directory]::Exists($p)) {[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($p,'OnlyErrorDialogs','SendToRecycleBin')} else {[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p,'OnlyErrorDialogs','SendToRecycleBin')}";
            HostCommand::new(
                "powershell.exe",
                ["-NoProfile", "-Command", script, target_path],
            )
        }
        HostPlatform::Linux | HostPlatform::Unknown => {
            HostCommand::new("gio", ["trash", target_path])
        }
    }
}
