# Chrome MV3 hot reload

Research date: 2026-08-25. Scope: AgentStart's Chrome MV3 extension, including its side panel, workspace
page, settings, DevTools panel, background service worker, manifest, and programmatic page scripts.

## Decision

AgentStart uses **WXT 0.21.4** as the extension lifecycle and build layer. WXT keeps Vite underneath, so
the existing React, React Compiler, Tailwind, and `@agentstart/client` source-resolution plugins remain in
use. WXT adds the missing extension-specific pieces: entrypoint discovery, development manifest
generation, UI HMR, background reload, and development output synchronization.

WXT is the best fit because it has first-class background, DevTools, side-panel, and unlisted-page
entrypoints and accepts ordinary Vite plugins. See the official
[entrypoint reference](https://wxt.dev/guide/essentials/entrypoints) and
[Vite configuration contract](https://wxt.dev/guide/essentials/config/vite).

## Development workflow

Run the daemon and WXT together:

```bash
pnpm dev
```

On the first run, enable Developer mode in `chrome://extensions` and load
`apps/extension/.output/chrome-mv3-dev` as an unpacked extension. WXT keeps that directory current.
The production command writes `apps/extension/.output/chrome-mv3` instead:

```bash
vp run @agentstart/extension#build
```

Automatic browser startup is deliberately disabled. A normal signed-in Chrome profile preserves
the developer's logins and other extensions, and Google removed `--load-extension` from branded
Chrome in version 137. Chrome for Testing or Chromium remains suitable for a disposable automated
profile. See [Chrome's announcement](https://developer.chrome.com/blog/extension-news-june-2025#removing-the-load-extension-flag)
and [WXT browser startup configuration](https://wxt.dev/guide/essentials/config/browser-startup).

## What “hot reload” means in MV3

| Changed surface | Development behavior | State impact |
| --- | --- | --- |
| React component or CSS in side panel, workspace, settings, or DevTools panel | Vite HMR / React Fast Refresh | Component state is normally retained while the module remains a valid refresh boundary. |
| HTML shell, bootstrap, or invalid HMR boundary | Reload that extension page | Page-owned state is recreated; daemon-owned state reconnects. |
| MV3 service worker or one of its imports | Rebuild and full extension reload | Worker globals, ports, debugger attachments, and page connections are recreated. |
| Manifest, permissions, or entrypoint graph | Regenerate manifest and full extension reload | A newly requested optional permission still requires a user grant. |
| Existing `chrome.scripting.executeScript({ func })` operation | Updated function runs on its next explicit invocation | The user's ordinary tab is not refreshed merely because extension code changed. |
| Future content script | Tool-managed re-registration or host-page reload | Cleanup must be idempotent so listeners and DOM are not duplicated. |

Chrome's MV3 service worker cannot be hot-swapped like a React component: its code belongs to the
extension package, and Chrome requires an extension reload after it changes. See the
[service-worker rules](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics)
and [MV3 packaged-code requirement](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3).

## AgentStart compatibility constraints

- The public key in [`wxt.config.ts`](../../apps/extension/wxt.config.ts) must remain unchanged. It
  pins extension ID `mfgmfiabfncmdekmikepemddejoeihbf`, which is part of Native Messaging and
  enterprise policy configuration.
- Production and development manifests come from one WXT configuration. WXT's development-only
  reload support must never leak a localhost script or extra required permission into the Web Store
  ZIP.
- WXT output paths are now canonical: `side-panel.html`, `workspace.html`,
  `devtools.html`, and `devtools-panel.html`. String paths in the daemon and extension use these
  names directly.
- Reloading the background may detach CDP recording, Console sensors, network mocks, or performance
  capture. Authoritative session and worktree state remains in the daemon; browser-owned ephemeral
  operations are not presented as surviving an extension reload.
- AgentStart has no declarative content script today. Background and UI edits therefore do not refresh
  normal website tabs.

## Alternatives considered

[CRXJS](https://crxjs.dev/guide/introduction/) is the lower-migration alternative for a plain Vite
project and supports extension-page HMR plus background reload. It was not selected because AgentStart
needs the broader entrypoint and browser-lifecycle framework, and CRXJS still tracks explicit
[Vite+ support](https://github.com/crxjs/chrome-extension-tools/issues/1215).

[Plasmo](https://github.com/PlasmoHQ/plasmo) was not selected because it would replace the current
Vite-based build with a more opinionated Parcel-based framework without improving MV3's fundamental
service-worker reload boundary.
