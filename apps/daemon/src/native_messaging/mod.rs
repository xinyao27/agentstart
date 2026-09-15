mod bootstrap;
mod frame;
mod host;
mod install;
mod picker;

pub(crate) use bootstrap::{
    BootstrapConnection, BootstrapError, PublishedExtensionBootstrap, RPC_PROTOCOL,
    clear_if_owned as clear_bootstrap_if_owned, read_connection as read_bootstrap_connection,
    read_connection_if_exists as read_bootstrap_connection_if_exists, read_extension_connection,
    write as write_bootstrap,
};
pub(crate) use host::run as run_host;
pub(crate) use install::{EXTENSION_ORIGIN, NativeMessagingInstallError, install};
pub(crate) use picker::{pick_project_directories, pick_project_directories_async};
