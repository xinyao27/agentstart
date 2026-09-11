export type LegalSection = {
  heading: string
  paragraphs: readonly string[]
  bullets?: readonly string[]
}

export type LegalDocument = {
  title: string
  updated: string
  intro: string
  sections: readonly LegalSection[]
}

export const privacyDocument: LegalDocument = {
  title: 'Privacy policy',
  updated: 'September 11, 2026',
  intro:
    'AgentStart is an open-source workspace for running coding agents from Chrome and a paired iPhone or iPad. There is no AgentStart account system or developer-operated workspace backend. The extension and mobile app connect to the AgentStart daemon that you run locally or at an endpoint you explicitly configure.',
  sections: [
    {
      heading: 'What AgentStart handles',
      paragraphs: [
        'AgentStart handles information only when a feature you use needs it. Depending on the permissions you grant and the actions you choose, this can include browser URLs and titles, selected or captured page content, screenshots, tab recordings, interaction timelines, browser history for a time window you choose, DevTools details, bookmarks, downloads, paired-host endpoints, credentials, and coding workspace or session content.',
        'The iOS camera is used only when you choose to scan a pairing code. Community site adapters are code that you review and install locally; AgentStart does not fetch adapter code from a remote catalog.'
      ]
    },
    {
      heading: 'Where your data goes',
      paragraphs: [
        'Browser data is sent to the AgentStart daemon endpoint you selected and to coding-agent processes that you explicitly invoke. The daemon can run on your computer, inside WSL, or on a remote host you connect to. Mobile workspace data follows the same paired-daemon path.',
        'The extension stores UI preferences, project favorites, layout choices, the optional on-device AI setting, and the daemon endpoint in Chrome extension storage. If Chrome Sync is enabled, Google may sync preferences and the endpoint under Google’s privacy terms; authentication tokens, captured content, recordings, history results, and workspace data are not placed in Chrome Sync. The iOS app stores paired-host credentials in Keychain and app preferences in its app-group containers.'
      ]
    },
    {
      heading: 'Product analytics and support reports',
      paragraphs: [
        'Stable and release-candidate daemon builds can send anonymous product events to PostHog at https://us.i.posthog.com/batch/. New installations start with Share anonymous usage data enabled, and you can change this under Privacy & Telemetry. DO_NOT_TRACK=1, AGENT_START_TELEMETRY_DISABLED=1, and CI environments disable product-event transmission. The iOS app and widget do not contain a PostHog client.',
        'Events use a random installation ID, session ID, app version, platform, architecture, operating-system release, release channel, event time, and event ID. Event-specific fields are limited to feature and action names, outcomes, settings, booleans, counts or buckets, durations, configured-repository counts, and onboarding cohorts. They do not include file contents, prompts, terminal output, page content, repository paths, personal names, email addresses, or account identities. One installation-failure event may include an error message of at most 200 characters.',
        'Feedback, crash, and diagnostic reports are separate explicit submissions. A report can contain the text you submit, your GitHub login and email when you choose a non-anonymous submission, and a bounded diagnostic excerpt. The full diagnostic bundle remains on your device.'
      ]
    },
    {
      heading: 'Sharing and retention',
      paragraphs: [
        'AgentStart does not sell data or use it for advertising or credit decisions. The developer can access the product-event fields sent to PostHog and the contents of support reports you explicitly submit. If your daemon endpoint or an agent provider is operated by a third party, that provider’s terms and retention policy apply to its systems.',
        'Extension data remains until you remove the related item, clear extension storage, or uninstall AgentStart. Daemon workspace events and artifacts remain on the selected host until you delete them or remove the daemon data directory. Chrome bookmarks and downloads follow Chrome’s controls. Unpairing an iPhone removes its device credential from the daemon. Unsent telemetry is held in memory rather than written to disk.'
      ]
    },
    {
      heading: 'Permissions and security',
      paragraphs: [
        'The extension declares the browser permissions needed for its workbench, browser-development, side-panel, storage, tab, tab-group, navigation, download, debugger, and Native Messaging features. Broad page access, bookmarks, history, idle detection, notifications, keep-awake, scripting, tab capture, and user scripts are requested only when you activate the corresponding feature. Persistent site grants are exact-origin grants that you can review or revoke in AgentStart and Chrome.',
        'Page content is treated as untrusted before it reaches an agent. The local daemon requires a random token and an exact extension Origin before accepting a browser WebSocket. AgentStart’s use of information received from Chrome APIs follows the Chrome Web Store User Data Policy and its Limited Use requirements.'
      ]
    },
    {
      heading: 'Changes and contact',
      paragraphs: [
        'We may update this page when the product or its data practices change. The date at the top indicates the latest revision. For privacy questions, deletion help, or a report about this policy, contact the maintainers through the AgentStart GitHub issue tracker.'
      ]
    }
  ]
}

export const termsDocument: LegalDocument = {
  title: 'Terms of use',
  updated: 'September 11, 2026',
  intro:
    'These terms describe the conditions for using the AgentStart website, Chrome extension, Rust daemon, iOS companion, and related open-source materials. By using AgentStart, you agree to use it lawfully and to accept responsibility for the machines, repositories, accounts, and third-party services you connect to it.',
  sections: [
    {
      heading: 'Open-source software',
      paragraphs: [
        'The AgentStart software in the repository is provided under the MIT License. The license grants broad rights to use, copy, modify, merge, publish, distribute, sublicense, and sell copies of the software, subject to the license notice and disclaimer. The website, documentation, and release artifacts may contain their own notices; keep those notices when you redistribute them.'
      ]
    },
    {
      heading: 'Your workspace and credentials',
      paragraphs: [
        'AgentStart runs commands, coding agents, browser actions, and workspace operations on hosts that you select. You are responsible for choosing the correct host and repository, reviewing commands and changes, maintaining backups, and deciding when to merge or publish work.',
        'You are responsible for the credentials, API keys, SSH access, GitHub access, agent-provider accounts, and other secrets that you configure. Do not give AgentStart or an agent more access than you intend, and do not use the product to access a system or data without permission.'
      ]
    },
    {
      heading: 'Third-party services',
      paragraphs: [
        'AgentStart can connect to coding-agent providers, Git hosts, Cloudflare, Apple, Google, Chrome Web Store, PostHog, SSH endpoints, and other services you choose. Those services are independent of AgentStart and may have their own terms, fees, availability, privacy practices, and usage limits. You are responsible for complying with them and for any charges they impose.'
      ]
    },
    {
      heading: 'Acceptable use',
      paragraphs: [
        'You may use AgentStart for lawful development and automation work. You must not use it to bypass authorization, interfere with another person’s systems, distribute malware, violate intellectual-property or privacy rights, evade service limits, or instruct an agent to perform unlawful activity. We may remove a hosted resource or restrict a distribution channel when required by law or a provider’s policy; the open-source license remains governed by its own terms.'
      ]
    },
    {
      heading: 'No warranty',
      paragraphs: [
        'AgentStart is provided “as is” and “as available,” to the fullest extent allowed by law. We do not promise that the software, website, daemon, extension, mobile app, agents, integrations, or generated code will be uninterrupted, secure, accurate, error-free, or fit for a particular purpose. Agent output can be incomplete, incorrect, destructive, or unsuitable for production; review it before relying on it.'
      ]
    },
    {
      heading: 'Limitation of liability',
      paragraphs: [
        'To the fullest extent permitted by law, the AgentStart maintainers and contributors are not liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost data, revenue, profits, or business interruption arising from use of or inability to use AgentStart. Nothing in these terms limits liability that cannot legally be limited.'
      ]
    },
    {
      heading: 'Changes and termination',
      paragraphs: [
        'We may change these terms when the project, distribution channels, or applicable requirements change. The date at the top indicates the latest revision. You can stop using AgentStart at any time by removing the extension, app, daemon, or related credentials. Data already stored on your devices or hosts remains there until you delete it.'
      ]
    },
    {
      heading: 'Contact',
      paragraphs: [
        'Questions about these terms, the open-source project, or a potential violation can be raised through the AgentStart GitHub issue tracker. For the software license text, see the repository’s MIT License.'
      ]
    }
  ]
}
