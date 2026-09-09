<h1 align="center">
  <a href="https://yiru.ai"><img src="apps/extension/public/icon.svg" alt="Yiru" width="64" valign="middle" /></a> Yiru
</h1>

<p align="center">
  <a href="https://github.com/xinyao27/yiru/stargazers"><img src="https://badgen.net/github/stars/xinyao27/yiru?label=%E2%98%85" alt="GitHub stars" /></a>
  <img src="https://badgen.net/github/license/xinyao27/yiru" alt="License" />
  <img src="https://img.shields.io/badge/macOS%20%7C%20Windows%20%7C%20Linux-4493F8?style=flat-square" alt="Supported platforms: macOS, Windows, and Linux" />
</p>

<p align="center">
  <strong>Coding agents in Chrome, backed by a native Rust daemon.</strong><br />
  Keep agents, isolated Git worktrees, terminals, browser context, and reviews together.
</p>

<h3 align="center"><a href="https://github.com/xinyao27/yiru/releases"><ins>Get Yiru</ins></a></h3>

## What is Yiru?

Yiru is an open-source Chrome workspace for agent-assisted software development. A single Rust daemon owns the repositories, worktrees, terminals, sessions, and event history; the extension supplies cross-tab navigation and one full workspace per tab.

Each task can live in its own worktree while Yiru keeps the surrounding workflow visible: agent sessions, terminals, source control, browser evidence, pull requests, and notifications. The iOS companion pairs directly with the daemon using end-to-end encryption.

## Core capabilities

- **Parallel worktrees:** Run independent tasks against the same repository and compare their results before merging.
- **Agent sessions:** Start, monitor, resume, and organize terminal-based coding agents from one workspace.
- **Native terminals:** Use PTYs, bounded scrollback, process facts, and persistent event history owned by the daemon.
- **Chrome navigation:** Use the side panel as a cross-tab project/session navigator and each tab as a focused workspace.
- **Deterministic context:** Match page URLs, exact git remotes, and known workspace ports; when no fact matches, Yiru hides the suggestion instead of guessing.
- **Browser evidence:** Record CDP actions, simulate network responses, compare screenshots, inspect Console events, pick elements, and write DevTools or EyeDropper changes back to the worktree.
- **Remote development:** Run the daemon beside the repository locally, inside WSL, or on a remote host reached through SSH forwarding or a private network.
- **Mobile companion:** Pair an iOS 26 device directly to monitor sessions, receive notifications, inspect changes, and send follow-up instructions.

## Coding agents

Yiru works with terminal-based coding agents installed on the daemon host. Authentication, model access, and usage limits remain under the control of each agent provider.

The workspace does not require every agent to expose the same capabilities. Yiru keeps provider-specific behavior isolated while presenting sessions, worktrees, files, terminals, and reviews through a consistent interface.

## Install and run

Release builds produce one daemon binary for Darwin arm64/x64, Linux glibc and musl arm64/x64, and Windows x64. Published releases have three CLI entry points:

```bash
curl -fsSL https://raw.githubusercontent.com/xinyao27/yiru/main/apps/daemon/scripts/install.sh | sh
brew tap xinyao27/yiru https://github.com/xinyao27/yiru && brew install yiru
npx @yiru/cli
```

`bunx @yiru/cli` uses the same npm package. The shell and npm installers verify the release checksum,
register Native Messaging, start the daemon service, and open Yiru's Chrome Web Store page. Chrome
requires one final user confirmation before adding the extension.

To build the current platform locally instead:

```bash
pnpm install
vp run @yiru/daemon#build
apps/daemon/target/release/yiru service install
apps/daemon/target/release/yiru native-messaging install
```

Then build the extension and load `apps/extension/.output/chrome-mv3` from
`chrome://extensions` with Developer mode enabled:

```bash
vp run @yiru/extension#build
```

Clicking the Yiru toolbar icon opens the side panel; there is no popup. See [all releases](https://github.com/xinyao27/yiru/releases) for packaged binaries.

### Mobile companion

Install the mobile app, then pair it directly with the daemon.

- **iOS:** [Join the TestFlight beta](https://testflight.apple.com/join/67PVx1Se)
- **Private networking and notifications:**
  [Set up direct cross-network access and APNs](docs/reference/mobile-cross-network.md)

## Develop locally

Yiru is a pnpm monorepo. Development requires Rust 1.95, Node.js 24, pnpm 12.1.0, and Bun 1.4 for the build scripts.

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
vp run @yiru/daemon#build           # Compile the daemon for this platform
vp run @yiru/extension#build       # Build the unpacked Chrome extension
vp run yiru-mobile#build           # Build the native iOS companion
```

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for repository conventions, platform setup, and contribution guidance.

Releases use one guarded local command and GitHub Actions for signing and publication. See the
[release runbook](docs/reference/releasing.md) for credential setup, preparation, deployment, and
retry commands.

## Support and privacy

- [Report a bug or request a feature](https://github.com/xinyao27/yiru/issues)
- [Review release notes and downloads](https://github.com/xinyao27/yiru/releases)
- [Read the privacy policy](PRIVACY.md)
- [Deploy Yiru with Chrome enterprise policy](docs/reference/enterprise-deployment.md)

## License

Yiru is free and open source under the [MIT License](LICENSE).
