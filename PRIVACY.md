# AgentStart privacy policy

Last updated: September 10, 2026

AgentStart's purpose is to let you operate coding agents and development workspaces from Chrome and a
paired iPhone or iPad. AgentStart has no advertising, account system, or developer-operated stateful
app backend. The Chrome extension and iOS app connect to an AgentStart daemon that you run locally or
at an endpoint you explicitly configure.

## Data AgentStart handles

AgentStart handles data only when needed for a feature you invoke. Depending on the permissions you
grant, this can include page URLs and titles, selected or captured page content, screenshots and tab
recordings, DOM interaction timelines, browser history from the time window you choose, DevTools
Console and Network details, project bookmarks, downloaded daemon artifacts, paired-host endpoints and
credentials, and coding workspace or session content. The iOS camera is used only when you choose to
scan a pairing code. A community site adapter is code you review and install locally; AgentStart does
not fetch adapter code from a remote catalog.

The extension stores its UI preferences, project favorites, layout choices, optional on-device AI
setting, and daemon endpoint in Chrome extension storage. If Chrome Sync is enabled, Google may sync
the endpoint and preferences under Google's privacy terms. Daemon authentication tokens, captured
browser content, recordings, history results, and workspace data remain in device-local extension
storage or the selected AgentStart daemon; authentication tokens are never placed in Chrome Sync.
The iOS app keeps paired-host credentials in Keychain and app and widget preferences in its app-group
containers.

## Product analytics and support reports

Telemetry-capable daemon builds send product events to PostHog at
`https://us.i.posthog.com/batch/`. The transport is present only when a build embeds a `stable` or
`rc` identity and a non-empty PostHog write key. New installations start with **Share anonymous usage
data** enabled. Installations that predate telemetry do not send events until the user resolves the
first-launch notice; choosing **Got it** or dismissing the notice enables telemetry, while choosing
**Opt out** disables it. The setting can be changed under Privacy & Telemetry. `DO_NOT_TRACK=1`,
`AGENT_START_TELEMETRY_DISABLED=1`, and CI environments disable product-event transmission.

The iOS app and widget do not contain a PostHog client or send product analytics to the developer.
Daemon telemetry uses daemon-side installation, session, platform, and operating-system values.

Every product event includes a random persistent installation ID, a random session ID, app version,
platform, architecture, operating-system release, release channel, event time, and a random event ID.
Event-specific fields come from a closed schema of feature and action names, outcomes, settings,
booleans, counts or count buckets, and durations. Some events add the number of configured repositories
or an onboarding cohort. The schema has no fields for file contents, prompts, terminal output, page
content, repository paths, personal names, email addresses, or account identities. One agent-hook
installation failure event permits an error message of at most 200 characters. The sender disables
PostHog GeoIP enrichment and person-profile creation.

Disabling telemetry sends one final `telemetry_opted_out` event and then blocks later product events.
Feedback, crash, and diagnostic reports use a separate explicit submission path and are not governed by
the product-telemetry setting. A submitted report can contain the report text, GitHub login and email
when the user chooses a non-anonymous submission, and a bounded diagnostic excerpt and size metadata.
The full diagnostic bundle remains on the device.

## Use, sharing, and retention

AgentStart uses this data only to provide the user-facing workspace, agent, browser-context, debugging,
recording, and replay features you request. It does not sell data or use it for advertising or credit
decisions. Browser data is sent only to the daemon endpoint you selected and to coding-agent processes
that you explicitly invoke. Mobile workspace data follows the same paired-daemon path.
The developer can access the product events and support-report fields sent to PostHog, including report
content the user explicitly submits. If the daemon endpoint or an agent provider is operated by a third
party, its own terms and retention policy apply.

Data stored by the extension remains until you remove the related item, clear extension storage, or
uninstall AgentStart. Daemon workspace events and artifacts remain on the selected host until you delete
them or the daemon's data directory. Chrome bookmarks and downloads follow Chrome's own retention
controls. Unpairing the iPhone removes its device credential from the daemon.

The daemon holds unsent telemetry in memory rather than writing the queue to disk. PostHog retention
and deletion procedures are configured outside the application and are not defined by this source
repository.

## Permission and security controls

The extension always declares context-menu, debugger, download, Native Messaging, side-panel,
storage, tab, tab-group, and navigation permissions for its workbench and browser-development
features. Broad page access, bookmarks, history, idle detection, notifications, keep-awake,
scripting, tab capture, and user scripts are requested only when you activate their corresponding
feature. Page content is labelled as untrusted before it reaches an agent. Persistent site grants
are exact-origin grants and can be reviewed or revoked in AgentStart and Chrome. The local daemon
requires a random token and an exact extension Origin before accepting a browser WebSocket.

AgentStart's use of information received from Chrome APIs adheres to the Chrome Web Store User Data Policy,
including the Limited Use requirements.

For privacy questions or deletion help, open an issue at
[github.com/xinyao27/agentstart/issues](https://github.com/xinyao27/agentstart/issues).
