mod capabilities;
mod git_bash;
mod model;
mod pwsh;
mod registry;
mod system;
mod wsl;

pub(crate) use git_bash::executable as git_bash_executable;
pub(crate) use model::{
    HostAddInput, HostAddResult, HostCapability, HostDescriptor, HostListResult, HostProbeResult,
    HostRemoveResult, RegistryHostKind,
};
pub(crate) use registry::{HostRegistry, HostRegistryError};
pub(crate) use system::SystemHostCapabilities;
