use crate::mobile::{
    MobileDeviceStore, MobileKeypair, MobilePairingManager, MobilePairingOffer,
    MobilePairingOfferError, MobilePresence, MobileServerConfig, create_pairing_offer,
};
use crate::runtime_environment::RuntimeEnvironmentAuthority;

pub(super) struct RuntimeMobile {
    devices: MobileDeviceStore,
    keypair: MobileKeypair,
    pairing: MobilePairingManager,
    presence: MobilePresence,
}

impl RuntimeMobile {
    pub(super) fn new(devices: MobileDeviceStore, keypair: MobileKeypair) -> Self {
        let pairing = MobilePairingManager::new(devices.clone(), keypair.clone(), None);
        Self {
            devices,
            keypair,
            pairing,
            presence: MobilePresence::default(),
        }
    }

    pub(super) fn activate_endpoint(&self, endpoint: String) {
        self.pairing.publish_endpoint(Some(endpoint));
    }

    pub(super) fn pairing(&self) -> MobilePairingManager {
        self.pairing.clone()
    }

    pub(super) fn server_config(
        &self,
        port: u16,
        runtime_id: String,
        runtime_environments: RuntimeEnvironmentAuthority,
    ) -> MobileServerConfig {
        MobileServerConfig {
            devices: self.devices.clone(),
            keypair: self.keypair.clone(),
            port,
            presence: self.presence.clone(),
            runtime_id,
            runtime_environments,
        }
    }

    pub(super) async fn create_pairing_offer(
        &self,
        endpoint: &str,
        address: &str,
        device_name: String,
    ) -> Result<MobilePairingOffer, MobilePairingOfferError> {
        create_pairing_offer(&self.devices, &self.keypair, endpoint, address, device_name).await
    }
}
