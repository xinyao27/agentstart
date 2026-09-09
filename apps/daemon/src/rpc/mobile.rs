mod input;
pub(super) mod protocol;

use crate::mobile::MobilePairingManager;

#[derive(Clone)]
pub(super) struct MobileRpc {
    pairing: MobilePairingManager,
}

impl MobileRpc {
    pub(super) fn new(pairing: MobilePairingManager) -> Self {
        Self { pairing }
    }
}
