use std::io;

use if_addrs::IfAddr;
use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
pub(crate) struct MobileNetworkInterface {
    pub(crate) address: String,
    pub(crate) name: String,
}

pub(super) async fn list_network_interfaces() -> Result<Vec<MobileNetworkInterface>, io::Error> {
    let mut interfaces = tokio::task::spawn_blocking(read_network_interfaces)
        .await
        .map_err(io::Error::other)??;
    interfaces.sort_by(|left, right| {
        left.name
            .cmp(&right.name)
            .then_with(|| left.address.cmp(&right.address))
    });
    interfaces.dedup_by(|left, right| left.name == right.name && left.address == right.address);
    Ok(interfaces)
}

fn read_network_interfaces() -> Result<Vec<MobileNetworkInterface>, io::Error> {
    Ok(if_addrs::get_if_addrs()?
        .into_iter()
        .filter_map(|interface| {
            let IfAddr::V4(address) = interface.addr else {
                return None;
            };
            if address.ip.is_loopback() || address.ip.is_unspecified() {
                return None;
            }
            Some(MobileNetworkInterface {
                address: address.ip.to_string(),
                name: interface.name,
            })
        })
        .collect())
}
