<h1 align="center">
  <a href="https://github.com/xinyao27/agentstart"><img src="apps/extension/public/icon.png" alt="AgentStart" width="64" valign="middle" /></a> AgentStart
</h1>

<p align="center">
  <a href="https://github.com/xinyao27/agentstart/stargazers"><img src="https://badgen.net/github/stars/xinyao27/agentstart?label=%E2%98%85" alt="GitHub stars" /></a>
  <img src="https://badgen.net/github/license/xinyao27/agentstart" alt="License" />
  <img src="https://img.shields.io/badge/macOS%20%7C%20Windows%20%7C%20Linux-4493F8?style=flat-square" alt="Supported platforms: macOS, Windows, and Linux" />
</p>

<p align="center">
  <strong>Coding agents in Chrome, backed by a native Rust daemon.</strong><br />
  Keep agents, isolated Git worktrees, terminals, browser context, and reviews together.
</p>

<h3 align="center"><a href="https://github.com/xinyao27/agentstart/releases"><ins>Get AgentStart</ins></a></h3>

## What is AgentStart?

AgentStart is an open-source Chrome workspace for agent-assisted software development. A single Rust daemon owns the repositories, worktrees, terminals, sessions, and event history; the extension supplies cross-tab navigation and one full workspace per tab.

Each task can live in its own worktree while AgentStart keeps the surrounding workflow visible: agent sessions, terminals, source control, browser evidence, pull requests, and live activity. The iOS companion pairs directly with the daemon using end-to-end encryption.

## Core capabilities

- **Parallel worktrees:** Run independent tasks against the same repository and compare their results before merging.
- **Agent sessions:** Start, monitor, resume, and organize terminal-based coding agents from one workspace.
- **Native terminals:** Use PTYs, bounded scrollback, process facts, and persistent event history owned by the daemon.
- **Chrome navigation:** Use the side panel as a cross-tab project/session navigator and each tab as a focused workspace.
- **Deterministic context:** Match page URLs, exact git remotes, and known workspace ports; when no fact matches, AgentStart hides the suggestion instead of guessing.
- **Browser evidence:** Record CDP actions, simulate network responses, compare screenshots, inspect Console events, pick elements, and write DevTools or EyeDropper changes back to the worktree.
- **Remote development:** Run the daemon beside the repository locally, inside WSL, or on a remote host reached through SSH forwarding or a private network.
- **Mobile companion:** Pair an iOS 26 device directly to monitor sessions and activity while connected, inspect changes, and send follow-up instructions.

## Coding agents

AgentStart works with terminal-based coding agents installed on the daemon host. Authentication, model access, and usage limits remain under the control of each agent provider.

The workspace does not require every agent to expose the same capabilities. AgentStart keeps provider-specific behavior isolated while presenting sessions, worktrees, files, terminals, and reviews through a consistent interface.

## Install

One command installs the daemon, registers the browser connection, and hands over the mobile app:

```bash
curl -fsSL https://agentstart.ai/install.sh | sh
```

Windows uses PowerShell:

```powershell
irm https://agentstart.ai/install.ps1 | iex
```

The installer verifies the release checksum, installs the daemon, registers the Chrome Native
Messaging host, starts the daemon at login, opens the Chrome Web Store listing, waits for the
extension to connect, and prints the iOS TestFlight link with a scannable code. macOS and Linux run
on arm64 or x64, Windows on x64. [agentstart.ai/install](https://agentstart.ai/install) walks
through the whole thing.

| Variable | Effect |
| --- | --- |
| `AGENTSTART_INSTALL_DIR` | Where the daemon binary is installed, `~/.local/bin` by default |
| `AGENTSTART_VERSION` | Release tag to install, or `latest` |
| `AGENTSTART_EXTENSION_CHANNEL` | `web-store` (default), `unpacked`, or `skip` |
| `AGENTSTART_SKIP_SERVICE_INSTALL` | `1` installs the binary without touching the login service |
| `AGENTSTART_NO_MOBILE` | `1` omits the iOS link and code |

`sh install.sh --help` lists the same set. An assignment applies to the command it precedes, so a
piped install takes it on the right of the pipe:
`curl -fsSL https://agentstart.ai/install.sh | AGENTSTART_VERSION=0.1.2 sh`.

After installing, `agentstart status` reports the daemon and whether the extension is connected, and
`agentstart update` moves a binary install to the latest release — it declines for a Homebrew or npm
install and names the channel to update through instead.

| Piece | Install channel | Who updates it |
| --- | --- | --- |
| `agentstart` daemon | Latest GitHub release, checksum-verified | `agentstart update`, Homebrew, or npm |
| Chrome extension | Chrome Web Store, or a staged unpacked bundle via `AGENTSTART_EXTENSION_CHANNEL=unpacked` | Chrome updates the store listing; the daemon refreshes the unpacked bundle |
| iOS companion | TestFlight | TestFlight |

`npx @agentstart/cli`, `bunx @agentstart/cli`, the Homebrew formula, and the signed `AgentStart.dmg`
come from [all releases](https://github.com/xinyao27/agentstart/releases). The extension keeps its
own Chrome Web Store submission and review timeline.

### Mobile companion

Install the mobile app, then pair it directly with the daemon.

- **iOS:** [join the TestFlight beta](https://testflight.apple.com/join/9Cq3j7hR)
- **Private networking:**
  [Set up direct cross-network access](docs/reference/mobile-cross-network.md)

## Run from source

```bash
pnpm install
vp run @agentstart/daemon#build
apps/daemon/target/release/agentstart install
```

Then build the extension and load `apps/extension/.output/chrome-mv3` from
`chrome://extensions` with Developer mode enabled:

```bash
vp run @agentstart/extension#build
```

Clicking the AgentStart toolbar icon opens the side panel; there is no popup.

## Develop locally

AgentStart is a pnpm monorepo. Development requires Rust 1.95, Node.js 24, and pnpm 12.1.0.

```bash
pnpm install
pnpm dev
```

For extension development, load `apps/extension/.output/chrome-mv3-dev` as an unpacked extension
once. WXT then applies React/CSS HMR to open extension pages and automatically reloads the MV3
extension when its background or manifest changes.

Useful commands:

```bash
pnpm typecheck           # Type-check all workspace projects
pnpm check               # Lint, format, typecheck, and repository contracts
pnpm lint                # Run and fix lint checks
pnpm fmt                 # Format the repository
```

Any package task is reachable from the repository root with `vp run <package>#<task>`:

```bash
vp run @agentstart/daemon#build           # Compile the daemon for this platform
vp run @agentstart/extension#build       # Build the unpacked Chrome extension
vp run agentstart-mobile#build           # Build the native iOS companion
vp run agentstart-web#build              # Build the AgentStart website
```

The website is a static Cloudflare Worker app in [`apps/web`](apps/web). Its deploy workflow runs
typechecking and publishes the `agentstart-web` Worker when `main` changes the site at
[`agentstart.ai`](https://agentstart.ai).

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for repository conventions, platform setup, and contribution guidance.

Releases use one guarded local command and GitHub Actions for signing and publication. See the
[release runbook](docs/reference/releasing.md) for credential setup, preparation, deployment, and
retry commands.

## Support and privacy

- [Report a bug or request a feature](https://github.com/xinyao27/agentstart/issues)
- [Review release notes and downloads](https://github.com/xinyao27/agentstart/releases)
- [Read the privacy policy](PRIVACY.md)
- [Deploy AgentStart with Chrome enterprise policy](docs/reference/enterprise-deployment.md)

## License

AgentStart is free and open source under the [MIT License](LICENSE).
