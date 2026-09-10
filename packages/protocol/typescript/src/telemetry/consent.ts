// Why: consumers display the runtime decision without re-deriving consent policy.
export type TelemetryConsentState =
  | { effective: 'enabled' }
  | {
      effective: 'disabled'
      reason: 'do_not_track' | 'agentstart_disabled' | 'ci' | 'user_opt_out'
    }
  | { effective: 'pending_banner' }
