use std::fs::File;
use std::io;
use std::path::Path;

#[cfg(windows)]
use std::collections::hash_map::DefaultHasher;
#[cfg(windows)]
use std::hash::{Hash, Hasher};

#[derive(Debug, Eq, PartialEq)]
pub(crate) struct FileIdentity(same_file::Handle);

impl FileIdentity {
    pub(crate) fn from_file(file: &File) -> io::Result<Self> {
        same_file::Handle::from_file(file.try_clone()?).map(Self)
    }

    pub(crate) fn from_path(path: &Path) -> io::Result<Self> {
        same_file::Handle::from_path(path).map(Self)
    }

    #[cfg(windows)]
    pub(crate) fn fingerprint(&self) -> u64 {
        let mut hasher = DefaultHasher::new();
        self.0.hash(&mut hasher);
        hasher.finish()
    }
}
