import { translate } from '~renderer/i18n/i18n'

export function remoteServerUpdateErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  switch (message) {
    case 'remote_update_manual_required':
      return translate(
        'auto.runtime.remoteServerUpdateErrors.manualRequired',
        'This server must be updated manually through its service manager.'
      )
    case 'remote_update_not_available':
      return translate(
        'auto.runtime.remoteServerUpdateErrors.notAvailable',
        'The server no longer reports an available update. Check again.'
      )
    case 'remote_update_not_downloaded':
      return translate(
        'auto.runtime.remoteServerUpdateErrors.notDownloaded',
        'The server update has not finished downloading.'
      )
    case 'method_not_found':
      return translate(
        'auto.runtime.remoteServerUpdateErrors.legacyServer',
        'Update this server manually once to enable remote updates.'
      )
    case 'remote_update_updater_timeout':
      return translate(
        'auto.runtime.remoteServerUpdateErrors.updaterTimeout',
        'Timed out waiting for the server updater.'
      )
    case 'remote_update_updater_stream_closed':
      return translate(
        'auto.runtime.remoteServerUpdateErrors.updaterStreamClosed',
        'The server stopped reporting update progress.'
      )
    case 'remote_update_requested_version_unavailable':
      return translate(
        'auto.runtime.remoteServerUpdateErrors.requestedVersionUnavailable',
        'The server updater did not offer the requested AgentStart version.'
      )
    case 'remote_update_status_unavailable':
      return translate(
        'auto.runtime.remoteServerUpdateErrors.updateUnavailable',
        'The server did not report an available update.'
      )
    case 'remote_update_download_incomplete':
      return translate(
        'auto.runtime.remoteServerUpdateErrors.downloadIncomplete',
        'The server update did not finish downloading.'
      )
    case 'remote_update_reconnect_timeout':
      return translate(
        'auto.runtime.remoteServerUpdateErrors.reconnectTimeout',
        'The server did not reconnect on the updated version.'
      )
    case 'remote_update_install_not_applied':
      return translate(
        'auto.runtime.remoteServerUpdateErrors.installNotApplied',
        'The server stayed on its previous version after the install connection closed.'
      )
    case 'remote_update_runtime_changed':
      return translate(
        'auto.runtime.remoteServerUpdateErrors.runtimeChanged',
        'The paired server changed while updating. Check again before retrying.'
      )
    default:
      return message
  }
}
