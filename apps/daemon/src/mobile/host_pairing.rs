use std::io;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{SystemTime, SystemTimeError, UNIX_EPOCH};

use serde::Serialize;
use thiserror::Error;

use super::network::{MobileNetworkInterface, list_network_interfaces};
use super::offer::{MobilePairingOfferError, create_pairing_offer, create_pending_pairing_offer};
use super::{MobileDeviceStore, MobileDeviceStoreError, MobileKeypair};

#[derive(Clone)]
pub struct MobilePairingManager {
    devices: MobileDeviceStore,
    endpoint: Arc<Mutex<Option<String>>>,
    keypair: MobileKeypair,
}

pub struct MobileDevelopmentPairingInput {
    pub address: String,
    pub device_name: String,
}

pub struct MobileHostPairingQrInput {
    pub address: Option<String>,
    pub rotate: bool,
}

#[derive(Debug, Error)]
pub enum MobilePairingManagerError {
    #[error("mobile pairing clock failed: {0}")]
    Clock(#[from] SystemTimeError),
    #[error("mobile network interface discovery failed: {0}")]
    Network(#[from] io::Error),
    #[error(transparent)]
    Offer(#[from] MobilePairingOfferError),
    #[error("mobile QR generation failed: {0}")]
    Qr(String),
    #[error(transparent)]
    Storage(#[from] MobileDeviceStoreError),
    #[error("mobile_server_unavailable")]
    Unavailable,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileDevelopmentPairingResult {
    pub(crate) device_id: String,
    pub(crate) endpoint: String,
    pub(crate) pairing_url: String,
}

#[derive(Serialize)]
pub struct MobileNetworkInterfacesResult {
    pub(crate) interfaces: Vec<MobileNetworkInterface>,
}

#[derive(Serialize)]
#[serde(untagged)]
pub enum MobilePairingQrResult {
    Unavailable {
        available: bool,
    },
    Available {
        available: bool,
        #[serde(rename = "deviceId")]
        device_id: String,
        endpoint: String,
        #[serde(rename = "pairingUrl")]
        pairing_url: String,
        #[serde(rename = "qrDataUrl")]
        qr_data_url: String,
    },
}

#[derive(Serialize)]
pub struct MobileDevicesResult {
    pub(crate) devices: Vec<MobilePairedDevice>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MobilePairedDevice {
    pub(crate) device_id: String,
    pub(crate) last_seen_at: i64,
    pub(crate) name: String,
    pub(crate) paired_at: i64,
}

impl MobilePairingManager {
    pub fn new(
        devices: MobileDeviceStore,
        keypair: MobileKeypair,
        endpoint: Option<String>,
    ) -> Self {
        Self {
            devices,
            endpoint: Arc::new(Mutex::new(endpoint)),
            keypair,
        }
    }

    pub fn publish_endpoint(&self, endpoint: Option<String>) {
        *lock(&self.endpoint) = endpoint;
    }

    pub async fn create_development_pairing(
        &self,
        input: MobileDevelopmentPairingInput,
    ) -> Result<MobileDevelopmentPairingResult, MobilePairingManagerError> {
        let endpoint = self
            .websocket_endpoint()
            .ok_or(MobilePairingManagerError::Unavailable)?;
        let offer = create_pairing_offer(
            &self.devices,
            &self.keypair,
            &endpoint,
            &input.address,
            input.device_name,
        )
        .await?;
        Ok(MobileDevelopmentPairingResult {
            device_id: offer.device_id,
            endpoint: offer.endpoint,
            pairing_url: offer.pairing_url,
        })
    }

    pub async fn list_network_interfaces(
        &self,
    ) -> Result<MobileNetworkInterfacesResult, MobilePairingManagerError> {
        Ok(MobileNetworkInterfacesResult {
            interfaces: list_network_interfaces().await?,
        })
    }

    pub async fn create_pairing_qr(
        &self,
        input: MobileHostPairingQrInput,
    ) -> Result<MobilePairingQrResult, MobilePairingManagerError> {
        let Some(endpoint) = self.websocket_endpoint() else {
            return Ok(MobilePairingQrResult::Unavailable { available: false });
        };
        let address = match input.address {
            Some(address) => address,
            None => {
                let Some(interface) = list_network_interfaces().await?.into_iter().next() else {
                    return Ok(MobilePairingQrResult::Unavailable { available: false });
                };
                interface.address
            }
        };
        let offer = create_pending_pairing_offer(
            &self.devices,
            &self.keypair,
            &endpoint,
            &address,
            pending_device_name()?,
            input.rotate,
        )
        .await?;
        let qr_data_url = super::qr::create_png_data_url(&offer.pairing_url)
            .map_err(|error| MobilePairingManagerError::Qr(error.to_string()))?;
        Ok(MobilePairingQrResult::Available {
            available: true,
            device_id: offer.device_id,
            endpoint: offer.endpoint,
            pairing_url: offer.pairing_url,
            qr_data_url,
        })
    }

    pub async fn list_devices(&self) -> Result<MobileDevicesResult, MobilePairingManagerError> {
        let devices = self
            .devices
            .list_paired()
            .await?
            .into_iter()
            .map(|device| MobilePairedDevice {
                device_id: device.id,
                last_seen_at: device.last_seen_at,
                name: device.name,
                paired_at: device.paired_at,
            })
            .collect();
        Ok(MobileDevicesResult { devices })
    }

    pub async fn revoke_device(
        &self,
        device_id: String,
    ) -> Result<bool, MobilePairingManagerError> {
        Ok(self.devices.remove(device_id).await?)
    }

    pub fn websocket_endpoint(&self) -> Option<String> {
        lock(&self.endpoint).clone()
    }
}

fn lock(endpoint: &Mutex<Option<String>>) -> MutexGuard<'_, Option<String>> {
    endpoint
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

fn pending_device_name() -> Result<String, SystemTimeError> {
    let days = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs() / 86_400;
    let (year, month, day) = civil_date(days as i64);
    Ok(format!("Mobile {year:04}-{month:02}-{day:02}"))
}

fn civil_date(days_since_epoch: i64) -> (i64, i64, i64) {
    let days = days_since_epoch + 719_468;
    let era = if days >= 0 { days } else { days - 146_096 } / 146_097;
    let day_of_era = days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    (year + i64::from(month <= 2), month, day)
}
