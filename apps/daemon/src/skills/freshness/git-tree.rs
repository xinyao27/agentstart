use std::collections::BTreeMap;

use sha1::Sha1;
use sha2::Digest;

use super::identity::ObservedFile;

#[derive(Default)]
struct GitTreeDirectory {
    directories: BTreeMap<String, GitTreeDirectory>,
    files: Vec<GitTreeFile>,
}

struct GitTreeFile {
    blob_sha: Vec<u8>,
    executable: bool,
    name: String,
}

pub(crate) fn package_git_tree_sha(files: &[ObservedFile]) -> Result<String, String> {
    let mut root = GitTreeDirectory::default();
    for file in files {
        let mut parts = file.path.split('/').collect::<Vec<_>>();
        let name = parts
            .pop()
            .filter(|name| !name.is_empty())
            .ok_or_else(|| "skill-package-invalid-path".to_owned())?;
        let mut directory = &mut root;
        for part in parts {
            if part.is_empty() {
                return Err("skill-package-invalid-path".to_owned());
            }
            directory = directory.directories.entry(part.to_owned()).or_default();
        }
        directory.files.push(GitTreeFile {
            blob_sha: file.blob_sha.clone(),
            executable: file.executable,
            name: name.to_owned(),
        });
    }
    Ok(hex(&hash_git_tree(&root)))
}

fn hash_git_tree(directory: &GitTreeDirectory) -> Vec<u8> {
    let mut children = directory
        .directories
        .iter()
        .map(|(name, child)| ("40000", name.as_str(), hash_git_tree(child), true))
        .chain(directory.files.iter().map(|file| {
            (
                if file.executable { "100755" } else { "100644" },
                file.name.as_str(),
                file.blob_sha.clone(),
                false,
            )
        }))
        .collect::<Vec<_>>();
    children.sort_by(|left, right| {
        let mut left_name = left.1.as_bytes().to_vec();
        let mut right_name = right.1.as_bytes().to_vec();
        if left.3 {
            left_name.push(b'/');
        }
        if right.3 {
            right_name.push(b'/');
        }
        left_name.cmp(&right_name)
    });
    let mut body = Vec::new();
    for (mode, name, hash, _) in children {
        body.extend_from_slice(mode.as_bytes());
        body.push(b' ');
        body.extend_from_slice(name.as_bytes());
        body.push(0);
        body.extend_from_slice(&hash);
    }
    git_object_sha("tree", &body)
}

pub(crate) fn git_object_sha(kind: &str, bytes: &[u8]) -> Vec<u8> {
    let mut hash = Sha1::new();
    hash.update(format!("{kind} {}\0", bytes.len()).as_bytes());
    hash.update(bytes);
    hash.finalize().to_vec()
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}
