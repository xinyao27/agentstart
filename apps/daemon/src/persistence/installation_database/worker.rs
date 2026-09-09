use rusqlite::Connection;
use tokio::sync::mpsc;

use crate::dangerous_approval::DangerousCredentialWorker;
use crate::mobile::devices::MobileDeviceWorker;
use crate::notifications::NotificationWorker;

use super::{InstallationCommand, close_connection};

pub(super) fn run(mut connection: Connection, mut commands: mpsc::Receiver<InstallationCommand>) {
    let dangerous_credentials = DangerousCredentialWorker;
    let mobile_devices = MobileDeviceWorker;
    let notifications = NotificationWorker::new();
    loop {
        match commands.blocking_recv() {
            Some(InstallationCommand::DangerousCredential(request)) => {
                dangerous_credentials.handle(&connection, request);
            }
            Some(InstallationCommand::MobileDevices(request)) => {
                mobile_devices.handle(&connection, request);
            }
            Some(InstallationCommand::Notifications(request)) => {
                notifications.handle(&mut connection, request);
            }
            Some(InstallationCommand::Close(response)) => {
                let _ = response.send(close_connection(connection));
                return;
            }
            None => {
                let _ = close_connection(connection);
                return;
            }
        }
    }
}
