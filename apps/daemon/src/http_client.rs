#[derive(Debug, thiserror::Error)]
#[error("the process TLS crypto provider could not be installed")]
pub(crate) struct CryptoProviderInstallError;

pub(crate) fn install_crypto_provider() -> Result<(), CryptoProviderInstallError> {
    if rustls::crypto::CryptoProvider::get_default().is_some() {
        return Ok(());
    }
    rustls::crypto::ring::default_provider()
        .install_default()
        .map_err(|_| CryptoProviderInstallError)
}
