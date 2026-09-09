# Contributing to Yiru

Thanks for contributing to Yiru.

## Before You Start

- Keep changes scoped to a clear user-facing improvement, bug fix, or refactor.
- Yiru targets macOS, Linux, and Windows. Every change must stay compatible with all three platforms unless the code is explicitly guarded by a runtime platform check.
- For keyboard shortcuts, use runtime platform checks in extension pages and Chrome's `mac` command override in the manifest.
- For shortcut labels, show `⌘` and `⇧` on macOS, and `Ctrl+` and `Shift+` on Linux and Windows.
- For file paths, use `Path`/`PathBuf` joins in the Rust daemon and `path.join` in Node-side tooling. Never concatenate separators by hand.
- The daemon can run locally, inside WSL, or on a remote host. Keep process, file, credential, shell, and network facts scoped to that daemon host.
- Yiru supports many CLI agents, integrations, and git providers. Keep generic behavior provider-neutral; guard integration-specific logic behind explicit checks.
- Keep changes well-engineered and performant: follow existing architecture, avoid unnecessary work in hot paths, clean up owned resources, and use concrete module names.
- For UI work, follow [`docs/style-guide.md`](../docs/style-guide.md), use the tokens and primitives it specifies, and verify polished behavior across Chrome surfaces and light/dark mode.

## Local Setup

The daemon is a Rust crate and the clients are TypeScript and Swift, so a full checkout needs
Rust 1.95, Node.js 24, pnpm 12.1.0, and Bun 1.4 for the build scripts.

```bash
pnpm install
pnpm dev
```

Load `apps/extension/.output/chrome-mv3-dev` once from `chrome://extensions` with Developer mode
enabled. The WXT process keeps that unpacked build current: extension-page React and CSS changes use
HMR, while background or manifest changes reload the extension.

## Branch Naming

Use a clear, descriptive branch name that reflects the change.

Good examples:

- `fix/ctrl-backspace-delete-word`
- `feat/shift-enter-newline`
- `chore/update-contributor-guide`

Avoid vague names like `test`, `misc`, or `changes`.

## Before Opening a PR

Run the same checks that CI runs:

```bash
pnpm lint
pnpm check
pnpm build
```

If your change affects UI or interaction behavior, verify it manually on the platforms it could impact.

## Type declarations

Project-owned declarations belong in `.ts` files. Do not add a hand-written `.d.ts`: generated
platform bindings such as Wrangler's `worker-configuration.d.ts` are the only exception.
`skipLibCheck` can silently widen unresolved names in a declaration file, while ordinary `.ts`
files remain part of the checked program.

## Pull Requests

Each pull request should:

- explain the user-visible change
- stay focused on a single topic when possible
- include screenshots or screen recordings for new UI or behavior changes
- explain the manual or runtime verification used; this repository does not retain test suites
- include a brief code review summary from your AI coding agent that explicitly checks cross-platform compatibility, SSH/remote/local compatibility, supported agent and integration compatibility, performance risk, UI quality when applicable, and basic security risk
- mention any platform-specific, remote/SSH-specific, agent-specific, integration-specific, or git-provider-specific behavior and testing notes

If there is no visual change, say that explicitly in the PR description.

## Release Process

Version bumps, tags, and releases are maintainer-managed. Do not include release version changes in a normal contribution unless a maintainer asks for them.

### Cutting a release (maintainers)

Update the daemon, npm CLI, Homebrew Formula, extension package, and workspace versions together,
then push a matching `v<version>` tag. `.github/workflows/daemon-release.yml` compiles the Rust
daemon for every supported platform, verifies checksums and installer metadata, uploads and attests
the binaries, and publishes `@yiru/cli` when `NPM_TOKEN` is configured.
