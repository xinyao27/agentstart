use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::{
    MobileNetworkInterface as ProtocolNetworkInterface, MobilePairedDevice as ProtocolPairedDevice,
    MobilePairingServiceCreateDevelopmentOfferRequest,
    MobilePairingServiceCreateDevelopmentOfferResponse, MobilePairingServiceGetPairingQrRequest,
    MobilePairingServiceGetPairingQrResponse, MobilePairingServiceListDevicesRequest,
    MobilePairingServiceListDevicesResponse, MobilePairingServiceListNetworkInterfacesRequest,
    MobilePairingServiceListNetworkInterfacesResponse, MobilePairingServiceRevokeDeviceRequest,
    MobilePairingServiceRevokeDeviceResponse,
};
use yiru_protocol::transport::{decode, encode};

use crate::mobile::{MobileHostPairingQrInput, MobilePairingManagerError, MobilePairingQrResult};

use super::MobileRpc;
use super::input::parse_development_values;

pub(in crate::rpc) async fn create_development_offer(
    rpc: &MobileRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<MobilePairingServiceCreateDevelopmentOfferRequest>(payload)?;
    let input = parse_development_values(&request.address, &request.device_name).map_err(|_| {
        status(
            StatusCode::InvalidArgument,
            "Expected a valid --address and non-empty --device-name",
        )
    })?;
    let result = rpc
        .pairing
        .create_development_pairing(input)
        .await
        .map_err(pairing_status)?;
    Ok(encode(
        &MobilePairingServiceCreateDevelopmentOfferResponse {
            device_id: result.device_id,
            endpoint: result.endpoint,
            pairing_url: result.pairing_url,
        },
    ))
}

pub(in crate::rpc) async fn list_network_interfaces(
    rpc: &MobileRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<MobilePairingServiceListNetworkInterfacesRequest>(payload)?;
    let result = rpc
        .pairing
        .list_network_interfaces()
        .await
        .map_err(pairing_status)?;
    Ok(encode(&MobilePairingServiceListNetworkInterfacesResponse {
        interfaces: result
            .interfaces
            .into_iter()
            .map(|interface| ProtocolNetworkInterface {
                name: interface.name,
                address: interface.address,
            })
            .collect(),
    }))
}

pub(in crate::rpc) async fn get_pairing_qr(
    rpc: &MobileRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<MobilePairingServiceGetPairingQrRequest>(payload)?;
    let result = rpc
        .pairing
        .create_pairing_qr(MobileHostPairingQrInput {
            address: request.address,
            rotate: request.rotate,
        })
        .await
        .map_err(pairing_status)?;
    let response = match result {
        MobilePairingQrResult::Unavailable { .. } => MobilePairingServiceGetPairingQrResponse {
            available: false,
            device_id: None,
            endpoint: None,
            pairing_url: None,
            qr_data_url: None,
        },
        MobilePairingQrResult::Available {
            device_id,
            endpoint,
            pairing_url,
            qr_data_url,
            ..
        } => MobilePairingServiceGetPairingQrResponse {
            available: true,
            device_id: Some(device_id),
            endpoint: Some(endpoint),
            pairing_url: Some(pairing_url),
            qr_data_url: Some(qr_data_url),
        },
    };
    Ok(encode(&response))
}

pub(in crate::rpc) async fn list_devices(
    rpc: &MobileRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<MobilePairingServiceListDevicesRequest>(payload)?;
    let result = rpc.pairing.list_devices().await.map_err(pairing_status)?;
    Ok(encode(&MobilePairingServiceListDevicesResponse {
        devices: result
            .devices
            .into_iter()
            .map(|device| ProtocolPairedDevice {
                device_id: device.device_id,
                name: device.name,
                paired_at_unix_ms: device.paired_at,
                last_seen_at_unix_ms: device.last_seen_at,
            })
            .collect(),
    }))
}

pub(in crate::rpc) async fn revoke_device(
    rpc: &MobileRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<MobilePairingServiceRevokeDeviceRequest>(payload)?;
    if request.device_id.is_empty() {
        return Err(status(StatusCode::InvalidArgument, "Device id is required"));
    }
    let revoked = rpc
        .pairing
        .revoke_device(request.device_id)
        .await
        .map_err(pairing_status)?;
    Ok(encode(&MobilePairingServiceRevokeDeviceResponse {
        revoked,
    }))
}

fn pairing_status(error: MobilePairingManagerError) -> Status {
    status(StatusCode::Internal, &error.to_string())
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}
