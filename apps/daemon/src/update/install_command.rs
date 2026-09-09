use std::path::Path;

const NPM_UPDATE_COMMAND: &str = "npm install --global @yiru/cli@latest";

pub(super) fn resolve(executable: &Path) -> &'static str {
    if crate::paths::containing_app(executable).is_some() {
        return "Update the complete Yiru app";
    }
    if cfg!(windows) || executable.parent().is_some_and(has_npm_marker) {
        return NPM_UPDATE_COMMAND;
    }
    let executable = executable.to_string_lossy();
    if executable.contains("/Cellar/yiru/") || executable.contains("/homebrew/") {
        return "brew upgrade yiru";
    }
    "yiru update"
}

fn has_npm_marker(directory: &Path) -> bool {
    directory.join("yiru.version").exists()
}
