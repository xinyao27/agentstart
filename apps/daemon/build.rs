#![forbid(unsafe_code)]

// Why: Cargo must reject missing or structurally stale generated runtime metadata before it can
// produce a daemon binary; runtime initialization validates the shared keybinding definitions.
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::Value;

const MANIFEST_SCHEMA_VERSION: u64 = 1;
const SKILL_RESOURCE_NAMES: [&str; 4] = [
    "current-manifest.json",
    "release-mapping.json",
    "skill-guides.json",
    "snapshot-registry.json",
];

fn main() {
    let crate_root = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").expect("crate root"));
    let workspace_root = crate_root.join("..").join("..");
    let source = workspace_root
        .join("packages")
        .join("protocol")
        .join("generated")
        .join("runtime-metadata.json");
    println!("cargo:rerun-if-changed={}", source.display());

    let contents = fs::read_to_string(&source).unwrap_or_else(|error| {
        panic!(
            "generated runtime metadata is unavailable at {}: {error}; run the protocol build first",
            source.display()
        )
    });
    let manifest = serde_json::from_str::<Value>(&contents)
        .unwrap_or_else(|error| panic!("generated runtime metadata is invalid JSON: {error}"));
    validate_manifest_shape(&manifest);

    let output =
        PathBuf::from(env::var_os("OUT_DIR").expect("Cargo OUT_DIR")).join("runtime-metadata.json");
    fs::write(output, contents).expect("copy generated runtime metadata into Cargo output");

    build_skill_resources(&workspace_root);
}

fn build_skill_resources(workspace_root: &Path) {
    let script = workspace_root
        .join("scripts")
        .join("build-skill-resources.mjs");
    let skills = workspace_root.join("skills");
    println!("cargo:rerun-if-changed={}", script.display());
    println!("cargo:rerun-if-changed={}", skills.display());

    let output =
        PathBuf::from(env::var_os("OUT_DIR").expect("Cargo OUT_DIR")).join("skill-resources");
    let status = Command::new("node")
        .arg(&script)
        .arg("--output")
        .arg(&output)
        .arg("--version")
        .arg(env!("CARGO_PKG_VERSION"))
        .current_dir(workspace_root)
        .status()
        .unwrap_or_else(|error| {
            panic!(
                "skill resource generator could not start at {}: {error}; install workspace dependencies first",
                script.display()
            )
        });
    assert!(status.success(), "skill resource generation failed");
    for name in SKILL_RESOURCE_NAMES {
        let path = output.join(name);
        let contents = fs::read_to_string(&path).unwrap_or_else(|error| {
            panic!(
                "generated skill resource is missing at {}: {error}",
                path.display()
            )
        });
        serde_json::from_str::<Value>(&contents).unwrap_or_else(|error| {
            panic!(
                "generated skill resource is invalid at {}: {error}",
                path.display()
            )
        });
    }
}

fn validate_manifest_shape(manifest: &Value) {
    let schema_version = manifest
        .get("schemaVersion")
        .and_then(Value::as_u64)
        .expect("runtime metadata schemaVersion");
    assert_eq!(
        schema_version, MANIFEST_SCHEMA_VERSION,
        "unsupported runtime metadata schema version"
    );
    let keybindings = manifest
        .get("keybindings")
        .and_then(Value::as_array)
        .expect("runtime metadata keybinding definitions");
    assert!(
        !keybindings.is_empty(),
        "runtime metadata must contain keybinding definitions"
    );
}
