# AgentStart 0.1.0 handoff completion

## Complete the page-tab navigation migration — 2026-09-14

- [ ] Define one typed page-open command from the Chrome Side Panel to a specific workbench host.
- [ ] Reuse the originating window's existing workbench tab and open the page in its unified queue.
- [ ] Keep `?view=` only for cold-start deep links and remove it from browser-tab identity matching.
- [ ] Audit and remove remaining old page-route ownership and stale URL assumptions.
- [ ] Format and run client/extension typechecks, the full repository gate, extension build, and diff checks.
- [ ] Record the final architecture, runtime evidence, and any intentionally retained deep-link behavior.

## Diagnose top-level sidebar view navigation — 2026-09-14

- [x] Review relevant navigation lessons and current worktree state.
- [x] Trace Sidebar navigation for Settings, Skills, Mobile, and other top-level surfaces.
- [x] Compare URL state, Chrome tab identity, and internal workbench tab ownership.
- [x] Record the architectural conclusion and a minimal correction direction without changing behavior.

## Review

- `?view=` is valid as a cold-start deep link, but the Side Panel background path still uses it as
  the Chrome Tab identity. Different page values therefore create or focus different browser tabs.
- The current client migration models Activity, Settings, Skills, and Mobile as real unified page
  tabs in the same queue as workspace tabs. Workbench-local Sidebar navigation already uses that
  queue, while Side Panel navigation still uses the old page-per-browser-tab model.
- The URL remains stale after an internal page-tab switch, yet the background continues matching
  browser tabs from that URL. Multi-window lookup is also global and can focus a matching page tab
  in another Chrome window.
- The correction boundary is the extension host navigation: focus a workbench in the originating
  window and deliver an internal page-open command; use `workspace.html?view=...` only when a new
  workbench must be bootstrapped. No runtime behavior was changed in this diagnostic pass.

## Restore workspace provider status — 2026-09-12

- [x] Trace the lower-left provider surface to its runtime state and initial-load path.
- [x] Load provider usage during startup hydration so the provider area cannot stay empty until an
      already-visible usage menu is opened.
- [x] Run formatting, typechecking, repository checks, extension build, and local runtime
      verification.
- [x] Record the root cause and verification evidence.

## Review

- The lower-left Provider surface is the status bar's usage segment. Its visibility is derived from
  `rateLimits`, which starts with every provider set to `null`; the only previous refresh trigger
  lived inside the usage dropdown, which itself could not render while the provider list was empty.
  This created a circular empty state.
- Startup hydration now calls `fetchRateLimits()` immediately after settings load. The daemon's
  rate-limit refresh returns a record for each provider, including unavailable/error statuses, so
  configured providers can render without requiring the user to open a menu first.
- `vp run @agentstart/client#typecheck`, `pnpm check`, `vp run @agentstart/extension#build`, and
  `git diff --check` passed. The local daemon reports `running` and the WXT development server
  remains active at `http://127.0.0.1:3100`. A live Chrome screenshot check was unavailable in this
  environment; no tests or validation harnesses were added.

## Restore provider usage display — 2026-09-12

- [x] Trace the provider usage chart and breakdowns to the authoritative runtime data.
- [x] Restore provider usage rendering without reintroducing AI Vault frame-limit failures.
- [x] Run formatting, typechecking, repository checks, and local development verification.
- [x] Record the root cause, repair evidence, and any intentionally retained loading behavior.

## Review

- The Home provider chart was gated on all three independent provider snapshots being ready. A
  transient failure in any one provider therefore replaced valid data from the other providers with
  an empty chart, and the one-shot preparation effect never retried after the runtime reconnected.
- The chart uses fresh live provider snapshots whenever all three are ready, falls back to the
  authoritative stats summary (filtered to the selected range) during partial reconnects, and keeps
  whatever provider data is available visible. Snapshot preparation retries after transient failures
  and stops once all three snapshots are ready. Cached contribution metrics no longer clear the live
  provider series during that window.
- `vp run @agentstart/client#typecheck`, `pnpm check`, `vp run @agentstart/extension#build`, and
  `git diff --check` passed. The local daemon reports `running` and the WXT development server
  remains active at `http://127.0.0.1:3100`. The production build retained only its existing chunk
  size warning; no tests or validation harnesses were added.

## Replace residual blue interaction accents — 2026-09-12

- [x] Trace the blue surfaces in the reported settings and side-panel screenshot to shared tokens.
- [x] Replace generic blue accent tokens with AgentStart-orange theme-derived selection surfaces
      while keeping primary actions and domain status colors intact.
- [x] Run formatting, typechecking, repository checks, and extension development rebuild validation.
- [x] Record the visual review and any intentionally retained semantic colors.

## Review

- The reported blue selected rows and segmented controls came from the global `--accent` and
  `--accent-foreground` pair, not from the already-correct `--primary` token.
- Light and dark accent surfaces now derive from `--brand` (`#ff5b03` by default), and themed
  workspace scopes rebind the same pair so selected rows follow a chosen workspace hue.
- Semantic blue values remain only where blue communicates a real domain state, such as info/chart
  data, Git decorations, terminal palettes, and browser automation overlays.
- `pnpm exec vp fmt packages/client/src/assets/main.css`, `vp run @agentstart/client#typecheck`,
  `pnpm check`, and `git diff --check` passed. The running WXT dev server emitted an HMR update for
  the stylesheet; daemon status remains `running`.

## Fix daemon frame-limit failures in Agent history — 2026-09-12

- [x] Confirm the compact projection preserves every field the browser history panel uses.
- [x] Make browser history requests use the compact projection and add a daemon-side byte guard.
- [x] Run formatting, typechecking, repository checks, extension build, and diff validation.
- [x] Record the repair evidence and any remaining limitations.

## Review

- Browser history now requests `compact: true`, retaining resumable metadata, previews, and recovery
  counters while omitting the token arrays that caused the 1 MiB unary response to overflow.
- The daemon's compact AI Vault response encoder now enforces the same frame budget before delivery:
  it drops previews first, then oldest sessions, and returns a typed resource-exhausted status only
  if even the compact metadata cannot fit. Full-detail callers retain their existing behavior.
- `vp run @agentstart/daemon#fmt`, `vp run @agentstart/daemon#typecheck`,
  `vp run @agentstart/client#typecheck`, `pnpm check`, `vp run @agentstart/extension#build`, and
  `git diff --check` passed. The extension build retained only its existing chunk-size warning.
- No tests, smoke checks, E2E harnesses, or validation scripts were added. A live browser/daemon
  session was not exercised in this pass; the fix is verified through the compiled client and daemon
  paths and the existing protocol frame guard.

## Diagnose daemon frame-limit error — 2026-09-12

- [x] Trace the exact error string to its daemon response-delivery guard.
- [x] Map the failing UI request to the AI Vault session-history RPC and inspect its parameters.
- [x] Compare the 1 MiB protocol limit with the session-history payload projection and local traces.
- [x] Record the root cause, evidence, and repair options without changing behavior during diagnosis.

## Review

- `apps/daemon/src/rpc/protocol_calls.rs` rejects any unary response whose encoded payload exceeds
  `MAX_FRAME_BYTES` (1 MiB), returning `Response exceeds the daemon frame limit`.
- The red notice is rendered by the browser AI Vault panel after
  `AiVaultService/ListSessions` fails. `packages/client/src/workspace-panel/ai-vault/session-refresh.ts`
  requests up to 500 sessions but does not set `compact`; the protocol client therefore sends
  `compact = false`, retaining per-session token-usage arrays and other verbose fields. In a scoped
  view, the daemon can also append up to 2,000 older in-scope sessions beyond that recency limit.
- The daemon's compact projection explicitly removes token usage, daily token breakdowns, last
  prompts, and subagent metadata, and bounds preview text. The non-compact 500-session response can
  therefore cross the 1 MiB single-frame limit as the local vault grows. Local trace evidence shows
  1,607 discovered transcripts and `AiVaultService/ListSessions` requests at the reported time;
  trace spans remain transport-successful because the status is emitted as the RPC result, while the
  response-size rejection happens in the delivery layer.
- No code was changed in this diagnostic pass. The durable fix should make the history list request
  compact records (or introduce paginated/streamed history), not hide the error or raise the global
  frame limit without a payload budget review.

## Settings full-width split layout — 2026-09-12

- [x] Map the centered shell, absolute navigation rail, and content max-width constraints.
- [x] Make the settings navigation rail and content pane span the full available viewport.
- [x] Preserve readable in-pane padding while removing outer centering and asymmetric max-width gaps.
- [x] Run formatting, typechecking, repository checks, extension build, and diff validation.
- [x] Record the visual review and correction lesson.

## Review

- Settings now uses a full-width split shell. The navigation rail is anchored at `left: 0`, the
  content pane starts immediately after the fixed rail, and the old centered 1040px shell plus
  content `max-width`/wide-screen right padding are gone.
- The content pane keeps its internal `px-8` and vertical rhythm for readability, while the outer
  layout no longer creates blank space on either side of the settings surface.
- `pnpm exec vp fmt packages/client/src/settings/page.tsx`, client typecheck, `pnpm check`,
  extension production build, and `git diff --check` passed. The extension build retains only its
  existing chunk-size warning; the lockfile-only runner mutation was restored.

## Theme-token audit — switch and accent surfaces — 2026-09-12

- [x] Trace the reported switch color from the shared primitive through the document theme inputs.
- [x] Make checked controls use the AgentStart theme primary while preserving workspace theme
      overrides, and remove only unrelated system-accent leakage.
- [x] Audit neighboring interactive accent surfaces and leave status, syntax, and domain palettes
      semantic where they are intentionally not primary actions.
- [x] Run formatting, typechecking, repository checks, extension build, and diff validation.
- [x] Record the visual review and correction lesson.

## Review

- The reported switch uses the shared `packages/client/src/ui/switch.tsx` primitive and already
  resolves its checked track through `bg-primary`; the brown color came from
  `useThemeGradientStyleVariables` replacing `--brand` with the native macOS accent fetched from
  the daemon.
- Browser `--brand`/`--primary` now stays on AgentStart orange `#FF5B03` by default. A selected
  workspace theme still supplies its own scoped `--brand`, including Base UI portals through the
  existing root variable bridge. The native system-accent read path no longer overrides product
  controls.
- The shared checkbox, slider, progress, button, badge, input-selection, and onboarding selection
  surfaces already consume semantic primary tokens. Warning, success, diff, syntax, Git, and
  browser-domain colors remain intentionally semantic instead of being recolored as primary
  actions.
- `pnpm exec vp fmt` passed for the touched CSS/TypeScript files; client typecheck, `pnpm check`,
  extension production build, and `git diff --check` passed. The extension build retained only its
  existing chunk-size warning. No tests, smoke checks, E2E harnesses, or validation scripts were
  added or retained.

## Rounded-corner consistency audit — 2026-09-12

- [x] Map the two reported controls to their owning feature components and shared primitives.
- [x] Correct missing or inconsistent radii at group boundaries while preserving edge-to-edge panes.
- [x] Run formatting, client typechecking, repository checks, extension build, and diff validation.
- [x] Record the visual review, verification evidence, and the correction lesson.

## Review

- The first screenshot maps to the workspace sidebar activity groups and toggle boundary in
  `packages/client/src/workspace-panel/sidebar-frame.tsx`; both grouped activity controls and the
  standalone toggle now have clipped, bordered `rounded-lg` shells so their outer corners are not
  inherited from square titlebar seams.
- The second screenshot maps to `SettingsSegmentedControl`; its bordered track now clips the
  segmented buttons inside a consistent `rounded-lg` boundary.
- The audit also corrected independent bordered surfaces that were visibly square: connection and
  unavailable-extension cards, inline popups, profile/account/runtime cards, onboarding and
  composer notices, source-control conflict notices, workspace cleanup warnings, browser settings
  sections, markdown review surfaces, workspace-space warnings, and sidebar badges. Edge-to-edge
  panes, tables, status rows, and divider-only regions remain square by design.
- `pnpm exec vp run @agentstart/client#typecheck` passed.
- `pnpm check` passed, including repository formatting/lint/typecheck, daemon cargo check and
  clippy, and the macOS Swift build.
- `pnpm exec vp run @agentstart/extension#build` passed; the existing chunk-size warning remains
  informational only.
- `git diff --check` passed. No test, smoke, or E2E harness was added or retained.

- [x] Read `HANDOFF.md`, repository instructions, and current git state.
- [x] Confirm the handoff commit is already on `origin/main` and the worktree starts clean.
- [x] Re-run the repository gate, extension Web Store packaging, mobile check, and diff check.
- [x] Audit the committed candidate for secrets, private keys/certificates/tokens, personal paths,
      oversized or generated build artifacts, forbidden test/smoke/E2E assets, suppressions, and
      active legacy branding.
- [x] Inspect the complete committed diff and verify release workflow/ref behavior and remote
      GitHub Actions state after the push.
- [x] Fix the in-scope CI defects, push the follow-up, and confirm its remote checks are green.
  - [x] Raise the Rust-native CI job budget to cover the post-rewrite release build on macOS and
        Windows, then confirm all three platforms complete.
- [x] Record final evidence and distinguish completed repository work from unperformed external
      publishing steps.

## Review

- The handoff commit was already `ba8986e83453d98f0ffe5e5cac4e1a4dedee132d` on `origin/main`.
  Its Extension Package run passed; Daemon Native Builds and Mobile Checks exposed the remaining
  cross-platform compiler failures.
- The daemon fixes narrow macOS-only imports, variants, and logic with target conditions, preserve
  the Windows executable path as an `OsString`, and retain the existing platform behavior.
- The mobile fixes avoid an `inout self` concurrency capture, make six protocol conformances
  explicitly nonisolated, and split one compiler-heavy aggregation expression without changing its
  result.
- `pnpm check`, `vp run agentstart-mobile#check`, and an Xcode 26.6 simulator build all pass.
- The Web Store archive contains 949 files, has SHA-256
  `24e257e15fcbb4a844322d46d41b889384812c232761e3c6e482cf19c62d267e`, and contains no source maps,
  source/test directories, `browser_settings`, or `update_url`.
- Diff, secret/private-key, personal-path, tracked-artifact, forbidden test-path, suppression, and
  Rust panic/unsafe scans are clean. The two secret-pattern matches are the literal public setting
  name `sk-notification-settings`, not credentials.
- No tags, GitHub releases, npm packages, Chrome Web Store submissions, TestFlight uploads, or
  notarization actions were created. External publishing remains intentionally unperformed; the
  missing npm/PostHog and Chrome Web Store secrets remain operator-owned blockers.
- [Mobile Checks run 34474299630](https://github.com/xinyao27/agentstart/actions/runs/34474299630)
  passed for `b8b2fe2a3ec01b17d329a739bad9c3201dafaff1`.
- The first daemon follow-up exposed four remaining Windows clippy diagnostics; after those were
  fixed, the next run passed every code check but confirmed that the Rust rewrite had outgrown the
  workflow's inherited 25-minute job limit on macOS and Windows.
- The native-build budget now matches the 45-minute release-build budget, and
  [Daemon Native Builds run 34477831241](https://github.com/xinyao27/agentstart/actions/runs/34477831241)
  passed for `f6eea204a7de65c6682ef67ed3307acadb939113` on Linux, macOS, and Windows.

## Manual end-to-end validation

- [x] Define the local extension-to-daemon and mobile-to-daemon user journeys from product docs.
- [x] Run the daemon and extension through a real browser session and exercise the available
      repository, worktree, session, and agent flows without retaining a test harness.
- [x] Build and launch the mobile app on a booted Simulator, inspect its UI and logs, and exercise
      the available connection and session flows without retaining a test harness.
- [x] Fix any in-scope defects discovered by the runtime exercise and re-run the affected journey.
- [x] Record exact evidence and separate locally verified behavior from WSL, SSH, signing, store,
      and credential-dependent paths that this environment cannot exercise.

## Manual E2E review — 2026-09-11

- Chrome MV3: a real `pnpm dev` daemon/WXT session was loaded into Chrome. The extension
  completed authenticated bootstrap, rendered the Projects surface, and exercised the registered
  repository, main worktree, session list, terminal creation, terminal output
  (`E2E_TERMINAL_OK`), and agent-session list paths. Fresh post-reload RPC traces for status,
  projects, worktrees, terminals, and agent sessions all completed successfully.
- The first folder-picker exercise reproduced a real defect: the 30-second default RPC deadline
  abandoned `ShellRepoHostService/PickFolders`, left the synchronous `osascript` child alive, and
  surfaced an unhandled renderer rejection. The daemon now uses a cancellable async picker with
  `kill_on_drop`, all interactive picker calls use a ten-minute deadline, and the add-project flow
  catches failures and shows a localized toast. The patched daemon passed the full Rust gate and a
  fresh daemon/WXT restart; the post-fix workspace/terminal journey completed without a renderer
  crash. The current Chrome accessibility surface did not expose the native folder-dialog controls
  for a second direct picker click, so that dialog's post-fix visual toast was not independently
  captured.
- iOS: `AgentStartMobile.xcodeproj` / `AgentStartMobile` built and launched on the booted iPhone 17
  Simulator (`74387C6C-BD19-45E6-892B-AE5BA371071B`). A deep-link pairing completed the actual
  websocket/E2EE/device-auth flow. Activity, workspace search, More actions, Settings, workspace,
  session, and terminal screens were navigated; daemon traces recorded successful mobile peer
  calls for repositories, worktrees, sessions, terminals, and workspace events. No product crash,
  fatal, or assertion appeared in the runtime logs. The existing terminal was sleeping, so Resume
  was not pressed to avoid changing external runtime state.
- Not exercised here: WSL/SSH host adapters, signing, store uploads, notarization, external
  credentials, and production publishing. No tests, smoke checks, E2E harnesses, or validation
  scripts were retained.

## UI polish: rounded surfaces

- [x] Inspect the reported Activity summary surface against the browser style guide and identify
      the owning feature boundary.
- [x] Apply component-appropriate corner radii to the summary surface and any directly related
      square inline panels.
- [x] Run formatting, typechecking, lint, and a visual browser sanity check at the affected page.
- [x] Record the review result and capture the correction lesson.

## UI polish review — 2026-09-11

- Activity summary now uses the same `rounded-xl` outer geometry as the shared `Card` primitive;
  `overflow-hidden` clips the four metric cells to that boundary while preserving the one-pixel
  separators.
- Related home inline empty states use `rounded-lg`, and the provider hover tooltip uses
  `rounded-md`. Edge-to-edge project rows and chart/table dividers remain square by design.
- `packages/client` formatting, typechecking, and lint passed. A live Chrome Activity page loaded
  through the dev extension showed the summary strip with visible rounded corners and the existing
  cards unchanged. The dev daemon/WXT session was stopped cleanly afterward.

## UI polish: Activity top spacing

- [x] Compare the reported screenshot with the Activity page layout and identify the missing
      vertical inset.
- [x] Add the page-level top padding without changing the card rhythm below the header.
- [x] Run the client checks and confirm the rendered page in Chrome.
- [x] Record the review result and capture the correction lesson.

## UI polish review — 2026-09-11 (top spacing)

- The Activity page shell now applies `pt-6`, keeping the existing horizontal inset and card gap
  unchanged while restoring the intended top breathing room.
- Full `pnpm check` passed, and the live Chrome Activity page confirmed the heading and summary
  strip are no longer flush with the top edge. The development session was stopped cleanly.

## Fix recurring workspace session conflict

- [x] Reproduce and trace the terminal-layout conflict path, including concurrent session and
      daemon-owned layout updates.
- [x] Fix the conflict handling at the owning session-document boundary without weakening true
      cross-client conflict protection.
- [x] Run repository gates and manually exercise the affected terminal/session flow in Chrome.
- [x] Record the review evidence and the correction lesson.

## Workspace session conflict review — 2026-09-11

- `mergeSessionEdit` now resolves known terminal-layout fields by ownership: renderer topology and
  visible pane state keep the local intent, while daemon PTY bindings and scrollback records keep
  the current server value. Stale tab removals no longer block on daemon binding updates.
- An inline merge exercise covered concurrent topology and PTY-binding changes without retaining a
  test file or harness. A live Chrome session then created and closed a terminal split with no
  conflict toast; the existing terminal tabs remained usable.
- Full `pnpm check` passed after the merge change, and the dev daemon/WXT session was stopped
  cleanly. The lockfile-only pnpm runner mutation was restored before review.

## Manual core E2E regression — 2026-09-11

- [x] Exercise the Chrome bootstrap, project/worktree/session navigation, terminal I/O, and
      terminal layout persistence against a fresh local daemon.
- [x] Exercise Chrome reload/reconnect and confirm the session remains usable without a save
      conflict or renderer error.
- [x] Re-run the booted iOS Simulator core navigation and terminal/session path.
- [x] Record exact evidence, cleanup, and any environment-dependent boundaries.

## Manual core E2E review — 2026-09-11

- Chrome: a fresh `pnpm dev` daemon/WXT session completed authenticated bootstrap after the
  development extension was reloaded, then rendered the existing project, main worktree, and two
  terminal sessions. Terminal input/output markers `E2E_CORE_OK` and `SPLIT_OK` were visible in
  the live renderer. Creating a right split produced two panes; the temporary pane was closed;
  the two session tabs remained usable and switchable.
- Chrome reload/reconnect: the browser reload control restored the project/worktree/session URL,
  both terminal tabs, and the `E2E_CORE_OK` scrollback without a save-conflict toast or renderer
  error. Activity navigation rendered the summary and contribution history, and selecting the
  session tab returned to the terminal surface.
- iOS: the installed `com.xinyao27.agentstart.mobile` app launched on the booted iPhone 17
  Simulator (`74387C6C-BD19-45E6-892B-AE5BA371071B`). Switching to a stale terminal tab surfaced
  the expected recoverable "Couldn't start terminal" state; pressing Retry reconnected the host
  session, and switching back to the existing `E2E terminal` rendered its prompt and scrollback.
  The Simulator's virtual keyboard did not accept injected text in this run, so a new iOS command
  marker was not claimed; daemon mobile traces still recorded active terminal streams and session
  list calls.
- Cleanup: the dev daemon/WXT process exited cleanly, the lockfile-only pnpm runner mutation was
  restored, and no temporary tests, smoke checks, E2E harnesses, or validation scripts were kept.
  WSL/SSH adapters, signing, store uploads, notarization, external credentials, and production
  publishing remain outside this machine-only run.

## Extension connection failure surface — 2026-09-11

- [x] Trace the browser bootstrap rejection paths that can leave the workspace root blank.
- [x] Ensure unexpected bootstrap failures render the existing connection guidance and recovery
      actions instead of rejecting into a blank page.
- [x] Re-run the client checks and a real Chrome disconnected-daemon exercise.
- [x] Record the exact failure-state evidence and cleanup.

## Extension connection failure review — 2026-09-11

- `mountExtensionSurface` now contains a final bootstrap rejection boundary. Unexpected errors
  render the existing unavailable surface with retry, connection settings, loopback guidance, and
  diagnostic details; Retry safely unmounts that fallback before attempting a fresh mount.
- A real Chrome development extension with the local daemon unavailable showed `AgentStart daemon
  is not available`, the CLI install command, `Retry now`, `Connection settings`, automatic retry
  text, and diagnostic details instead of a blank page.
- Extension typecheck/lint and full `pnpm check` passed. The extension dev server was stopped,
  the lockfile-only pnpm runner mutation was restored, and no temporary test or validation files
  were retained.

## Default primary color — 2026-09-11

- [x] Confirm the browser and mobile primary token owners and the derived roles that should follow
      the new default color.
- [x] Change the default primary brand color to `#FF5B03` without changing domain-specific color
      semantics or user-selected theme overrides.
- [x] Run formatting, typechecking, lint, and the relevant build checks.
- [x] Manually inspect the browser primary action in light and dark mode, then record review
      evidence and cleanup.

## Default primary color review — 2026-09-11

- Browser `--brand`, `--primary`, sidebar primary, and terminal locate roles now use `#FF5B03` by
  default in both themes. Primary foregrounds use the existing near-black text role so the orange
  action remains readable; user-selected workspace accents still override `--brand`.
- Mobile `Theme.Colors.primary` uses the same `#FF5B03` value in light and dark appearances, and
  the Home tile comment now documents the shared token rather than the old blue pair.
- `vp fmt`, client/extension typecheck and lint, full `pnpm check`, mobile Swift-format lint, and
  the iOS Simulator Debug build all passed. The temporary pnpm runner lockfile mutation was
  restored before review.
- A fresh Chrome development session loaded Activity and Appearance settings in light mode, then
  switched to dark mode and back to the original system theme. Both themes rendered without a
  blank page or renderer error; the settings card visibly followed the new orange primary border.
- The development daemon/WXT session was stopped cleanly. No tests, smoke checks, E2E harnesses, or
  validation scripts were added or retained.

## OG artwork refinement — 2026-09-11

- [x] Rebuild the social preview in the requested dark grid / orange edge-light style using the
      repository's AgentStart logo artwork as the right-side subject.

## macOS dual-channel browser installation

- [x] Bundle the production unpacked extension into the macOS app and DMG build.
- [x] Add a first-launch and repeatable menu-bar onboarding flow for Chrome Web Store and Fast
      (Load unpacked) installation, including Native Messaging and connection guidance.
- [x] Keep the Fast channel directory stable across app upgrades and document the required reload
      step after an app update.
- [x] Update macOS release documentation and build metadata for the bundled extension.
- [x] Run formatting, typechecking, and macOS app/DMG build verification, then review and commit.

## macOS dual-channel review — 2026-09-12

- The macOS app now bundles the production extension under `Contents/Resources/AgentStartExtension`
  and copies it atomically to `~/Library/Application Support/AgentStart/ChromeExtension`, keeping
  the user-selected Fast channel path stable across app updates.
- First launch and the menu bar's **Set up Chrome extension** item guide users through either the
  Web Store flow or Developer mode / Load unpacked, open the required Chrome pages and Finder
  folder, explain Native Messaging, and describe the Reload step after Fast updates.
- Native Messaging registration and Daemon origin admission now accept both the Fast extension ID
  and the current Chrome Web Store item ID. The selected channel controls which workspace URL the
  menu bar action opens.
- `pnpm check`, Swift release build, app assembly, code-sign verification, and `hdiutil verify`
  passed. The built app contains the daemon and extension manifest, and the embedded daemon's
  `native-messaging install --json` output lists both origins.
- The macOS session was locked during this run, so GUI clicking through the onboarding dialogs and
  Chrome's native Load unpacked picker could not be performed. No tests, smoke checks, E2E harnesses,
  or validation scripts were retained.
- [x] Inspect the rendered asset and verify its dimensions, metadata reference, and website build
      output without retaining a temporary artwork-generation file.
- [x] Record the review evidence and correction lesson.

## OG artwork review — 2026-09-11

- The social preview now follows the supplied reference composition: a charcoal grid workspace,
  restrained `#FF5B03` edge lighting, and an uncluttered scene with the exact AgentStart avatar
  placed as a small rounded badge in the lower-left corner. The logo remains an independent avatar
  asset instead of being reinterpreted as a bodyless generated character; no text treatment is used.
- `apps/web/public/og.jpg` is a stripped 1200×675 JPEG. The website build copies it unchanged and
  the route metadata continues to reference `https://agentstart.ai/og.jpg`.
- `vp run agentstart-web#typecheck`, `vp run agentstart-web#build`, and
  `vp run agentstart-web#deploy:dry-run` passed; `git diff --check` is clean.
- Temporary generated plates and composition files were kept outside the repository; no test,
  smoke-check, E2E, or validation artifact was retained.

## OG avatar placement correction — 2026-09-11

- [x] Remove the avatar's white source background while preserving the repository logo subject.
- [x] Place the enlarged transparent avatar in the lower-left corner at roughly one-third of the
      canvas, then inspect the rendered result.
- [x] Rebuild the website, verify the deployed asset path, and record the correction lesson.

## OG avatar placement review — 2026-09-11

- The white matte is removed from the high-resolution AgentStart avatar with a transparent cutout;
  the source robot artwork is not regenerated or reshaped.
- The avatar now sits in the lower-left corner at approximately 580px wide on the 1200px canvas,
  exceeding the requested one-third scale while keeping the reference scene readable.
- `vp run agentstart-web#typecheck`, `vp run agentstart-web#build`, and
  `vp run agentstart-web#deploy:dry-run` passed. The built `dist/og.jpg` is byte-identical to the
  source asset and remains 1200×675.

## OG image-generation correction — 2026-09-11

- The final OG was regenerated with the image-generation workflow using both the supplied scene
  reference and the AgentStart logo reference. It now renders the complete mascot in the lower-left
  with no white matte, on the requested dark grid / orange-light scene.
- The resulting 1200×675 JPEG is copied into `apps/web/public/og.jpg`; the build and deployment
  metadata continue to reference `https://agentstart.ai/og.jpg`.

## OG positioning background refinement — 2026-09-11

- [x] Replace the generic sci-fi background with a visual language that communicates AgentStart's
      developer workbench, including terminal, editor, Git/worktree, and agent-status cues.
- [x] Keep the complete AgentStart mascot large in the lower-left with no white matte or invented
      bodyless character, then inspect the final 1200×675 asset.
- [x] Rebuild the website and run the deployment dry-run against the updated asset.

## OG positioning background review — 2026-09-11

- Replaced the generic scene with a dark AgentStart workbench composition: terminal/editor panes,
  Git and worktree connection lines, agent status cards, and restrained orange edge lighting.
- The complete mascot remains in the lower-left at more than one-third of the canvas width, with no
  white matte. `apps/web/public/og.jpg` and `apps/web/dist/og.jpg` are both stripped 1200×675 sRGB
  JPEGs with identical SHA-256 `42e3a4388ee75a90d8570c2da91ca72ec8df98d83c90441e3220cadf0f7f0d93`.
- `vp run agentstart-web#typecheck`, `vp run agentstart-web#build`,
  `vp run agentstart-web#deploy:dry-run`, metadata checks, and `git diff --check` passed. No
  production deployment or external upload was performed.

## Commit and deploy AgentStart website — 2026-09-11

- [x] Commit the reviewed website, branding, release-setup, and workflow changes.
- [x] Push the commit to `origin/main` and confirm the remote revision.
- [x] Deploy the Worker from the authorized local Wrangler session and record the workflow
      credential boundary.

## Commit and deploy AgentStart website review — 2026-09-11

- Commit `09d6240d1` was created on `main` and pushed successfully to `origin/main`.
- Local `vp run agentstart-web#deploy` passed after Wrangler OAuth reauthorization. Cloudflare
  uploaded 12 assets and published Worker `agentstart-web` to `agentstart.ai` and
  `www.agentstart.ai`; version ID `7566bd1f-6a88-4a72-9470-5376e9d866a7`.
- The automatically triggered GitHub Actions run `34607301627` initially failed because the
  repository secret `CLOUDFLARE_API_TOKEN` was empty. After the secret was added, rerun job
  `103291638967` passed checkout, Vite+ setup, dependency installation, typecheck, and Cloudflare
  deployment. A live `curl` check could not resolve the custom domain from this environment, so
  DNS/edge reachability remains externally unverified here.


## ChatGPT theme palette alignment — 2026-09-11

- [x] Capture local ChatGPT/Codex palette evidence from app assets and official appearance guidance.
- [x] Inventory hardcoded browser and mobile colors and map them to semantic theme roles.
- [x] Replace page-level background, border, and text colors with theme tokens, preserving domain and
      status colors.
- [x] Run formatting, typecheck, lint, builds, and manual light/dark review.
- [x] Record review evidence, cleanup, and any external verification boundary.

## ChatGPT theme palette review — 2026-09-11

- Local `/Applications/ChatGPT.app` assets define the light/dark surface contract used here:
  light `#fff` / dark `#181818` canvas, light `#f9f9f9` / dark `#212121` sidebar, dark
  `#2d2d2d` popovers, foreground `#1a1c1f` / `#fff`, 8% borders, and 10% muted washes.
- Local accent/chart evidence maps blue to `#339cff` / `#83c3ff`, green to `#00a240` /
  `#40c977`, orange to `#e25507` / `#fb6a22`, purple to `#924ff7` / `#ad7bf9`, and yellow to
  `#ffc300` / `#ffd240`. AgentStart keeps the requested `#FF5B03` as its primary brand and uses
  the researched palette for informational, chart, and state roles.
- Browser surfaces, markdown/editor chrome, feature-wall visuals, terminal overlays, and mobile
  foundations now consume semantic theme variables. Git/diff, syntax highlighting, terminal themes,
  provider marks, and user-selected tab colors remain intentionally domain-owned.
- `vp fmt`, `pnpm check`, `vp run @agentstart/extension#build`, and `vp run agentstart-mobile#check`
  passed. `git diff --check` is clean. The extension build only reports its pre-existing large-chunk
  warning; no tests, smoke checks, E2E harnesses, or validation scripts were added or retained.
- Manual browser light/dark review from the preceding primary-color pass remains the UI evidence
  boundary; the repository gate and production extension/mobile builds verify the current source,
  but do not replace full user-flow or external-host validation.

## AgentStart website rebrand investigation — 2026-09-11

- [x] Trace the former `yiru.ai` website and its deployment files through repository history.
- [x] Confirm whether the current repository contains an AgentStart website or a verified AgentStart domain.
- [x] Choose the replacement domain and scope the rebrand before restoring or deploying a website.

## Review

- The former website lived in `apps/web` and was deployed to `yiru.ai` by `.github/workflows/web-deploy.yml`.
  Both were intentionally deleted by commit `527453ed6` during the Chrome/iOS product pivot.
- The owner confirmed `agentstart.ai` is already available in Cloudflare, so the restored site uses
  `https://agentstart.ai` as its canonical origin and routes both apex and `www` to the AgentStart
  Worker.

## Restore and rebrand AgentStart website — 2026-09-11

- [x] Restore the former `apps/web` website and its durable assets from repository history.
- [x] Rename website package, routes, SEO metadata, links, and user-facing copy to AgentStart.
- [x] Update Cloudflare Worker/Wrangler configuration and restore the guarded deploy workflow.
- [x] Run website build/typecheck plus the full repository gate and inspect generated metadata.
- [x] Record the domain ownership and deployment boundary without deploying externally.

## Restore and rebrand AgentStart website review — 2026-09-11

- Restored the complete former `apps/web` application and `.github/workflows/web-deploy.yml`, then
  renamed the workspace package and workflow targets to `agentstart-web`.
- Replaced all product-facing Yiru copy, repository links, SEO/JSON-LD metadata, theme storage key,
  favicon, and OG image with AgentStart branding. The OG image uses the same black robot/lightning
  icon shipped by the extension.
- Cloudflare Wrangler now publishes `agentstart-web` to `agentstart.ai` and `www.agentstart.ai`.
  The workflow remains guarded by `CLOUDFLARE_API_TOKEN`; no production deployment was performed.
- `vp run agentstart-web#typecheck`, `vp run agentstart-web#build`, `vp run agentstart-web#deploy:dry-run`,
  and `pnpm check` all passed. The generated homepage and FAQ contain AgentStart metadata and
  `https://agentstart.ai` canonical URLs; a local Wrangler runtime served both routes, returned the
  branded 404 page, and redirected `/download` to the AgentStart GitHub release. A direct Worker
  invocation also confirmed `www.agentstart.ai` redirects to the apex host with status 301.

## Publish AgentStart 0.1.0 — 2026-09-11

- [x] Push the reviewed release commit so `main` exactly matches `origin/main`.
- [x] Run the release conductor preflight and verify repository/workflow credentials.
- [ ] Publish the enabled release targets without creating tags until preflight passes.
- [ ] Monitor daemon, extension, and mobile workflows and record public artifact status.
- [x] Record blockers or completion evidence without retaining temporary validation files.

## 0.1.0 release review — 2026-09-11

- `main` is clean and exactly matches `origin/main` at `144b66753`; the release notes are present
  at `docs/releases/0.1.0.md`.
- The release conductor stopped before tag creation because the repository is missing
  `POSTHOG_WRITE_KEY`, `NPM_TOKEN`, and the four `chrome-web-store` environment secrets:
  `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_PUBLISHER_ID`, and `CWS_REFRESH_TOKEN`.
- No release tags were created and no daemon, extension, or mobile workflows were started.
- `bun upgrade` completed successfully and upgraded the local tool to Bun `1.4.2`. The release
  conductor currently pins Bun `1.4.0` to match CI, so publishing must use that pinned toolchain
  after the missing credentials are configured.

## Chrome Web Store first-item bootstrap — 2026-09-11

- [x] Add a durable initial-upload package path that removes `manifest.key` only from a staged ZIP.
- [x] Document the Web Store-generated item ID and public-key adoption step.
- [x] Build the bootstrap ZIP and inspect its manifest before handing it to the user.
- [ ] After the user creates the Web Store item, synchronize the generated ID and public key across
      extension, native messaging, release metadata, and CI, then rerun the release checks.

## Chrome Web Store first-item bootstrap review — 2026-09-11

- The user's dashboard screenshot confirms the first draft item was created with Item ID
  `ljgpbhfigjepmdeaggfdagchkgaogglp`. The current repository intentionally keeps the existing
  development key and extension ID until the Package tab returns the authoritative public key;
  changing only the ID before that response would make the development manifest inconsistent.
- Human-facing install links in the Formula template and daemon installer, plus the release setup
  item's selection prompt, now point to the new item page. Technical extension-origin, manifest-key,
  enterprise-policy, and CI upload references remain on the old ID until the matching Package-tab
  public key is available.
- `pnpm check`, `bash -n scripts/release-setup.sh`, and `git diff --check` passed after the link
  updates; the pnpm runner's lockfile-only mutation was restored.
- `pnpm exec vp run @agentstart/extension#package:web-store:initial` passed and produced
  `apps/extension/release/agentstart-extension-0.1.0-initial-upload.zip` (SHA-256
  `819b73eb64016b9e002d30f0a6453916233443d3ad8f30a6d1d4792a4728f2ed`). The archived manifest is
  MV3 version `0.1.0` and has no `key`; the source build still retains its pinned development key.
- Extension typecheck and lint passed. `bun apps/extension/scripts/package-web-store.mjs` also
  passed for the normal package path; the pnpm lockfile-only runner mutation was restored, and no
  tests, smoke checks, E2E harnesses, or validation scripts were added or retained.

## Chrome Web Store product details preparation — 2026-09-11

- [x] Map every Store listing field to verified repository copy, URLs, locales, and assets.
- [x] Add ready-to-paste English and Simplified Chinese summaries plus screenshot captions.
- [x] Verify the checked-in listing asset dimensions and identify fields that still require an
      external user choice or upload.
- [x] Record the prepared field map and external handoff steps.

## Chrome Web Store product details review — 2026-09-11

- The Store listing guide now contains a field-by-field map for name, summaries, category, locales,
  URLs, pricing, visibility, mature-content declaration, test instructions, screenshots, tile,
  video, and marquee handling. Copy is aligned with the packaged English and Simplified Chinese
  locale messages and `PRIVACY.md`.
- Asset inspection confirmed the packaged icon is `128x128`, both screenshots are `1280x800`, and
  the small promotional tile is `440x280`. No YouTube demo URL or marquee tile is present, so the
  dashboard handoff calls those out instead of inventing a link or placeholder.
- The external choices still belong to the publisher: whether to keep the item Unlisted during
  validation, whether to add a verified Official URL, and whether the dashboard requires a video.

## Chrome Web Store privacy-practices copy — 2026-09-11

- [x] Prepare a copy-paste single-purpose statement for the dashboard.
- [x] Prepare separate Chinese justifications for every required and optional permission and host
      access entry in the packaged manifest.
- [x] Reconcile the copy, data-use selections, and Limited Use certification with the
      implementation, then record the external review boundary.

## Chrome Web Store privacy-practices review — 2026-09-11

- Added a Simplified Chinese single-purpose statement and individual copy blocks for all 9 required
  permissions, 10 optional permissions, required loopback hosts, and optional website hosts.
- Added the exact six data categories to select, four categories to leave clear, the remote-code
  selection, and the Limited Use certification guidance. Google Analytics is intentionally left
  unconfigured because the product uses no Google Analytics client.
- Reconciled the blocks against `apps/extension/.output/chrome-mv3/manifest.json` and the extension's
  Chrome API call sites. The dashboard still owns the final Limited Use checkboxes and review
  submission; no permissions were changed in this preparation pass.

## Public legal pages — 2026-09-11

- [x] Add clear, implementation-backed Privacy and Terms pages under `/privacy` and `/terms`.
- [x] Add legal navigation, per-page metadata, prerendered outputs, and sitemap entries.
- [x] Remove the legacy `/privacy` redirect while preserving `/docs/*` redirects.
- [x] Run website typecheck, build, deployment dry-run, and diff checks.

## Public legal pages review — 2026-09-11

- Added English `/privacy` and `/terms` pages covering the actual daemon, extension, iOS, browser
  permissions, telemetry, support reports, third-party services, user responsibilities, MIT license,
  acceptable use, warranty, liability, retention, deletion, and contact paths.
- Footer links now reach both legal pages. Each page owns its title, description, canonical URL, and
  prerendered output. `sitemap.xml` includes both routes.
- Worker handling no longer redirects `/privacy`; `/docs/*` remains a legacy redirect to GitHub.
- `vp run agentstart-web#typecheck`, `vp run agentstart-web#build`,
  `vp run agentstart-web#deploy:dry-run`, output metadata checks, and `git diff --check` passed.

## Compact AgentStart logo surface correction — 2026-09-12

- [x] Replace opaque wordmark artwork in compact settings/help logo surfaces with the gray-backed
      favicon asset.
- [x] Add a component-sized semantic muted surface and modest radius to both related logo uses.
- [x] Run formatting, client typechecking, repository checks, and diff validation.
- [x] Record the visual review and verification boundary.

## Compact AgentStart logo surface correction review — 2026-09-12

- Settings navigation and the Help menu now use `packages/client/src/public/favicon.png`, whose
  transparent corners and gray-backed artwork remain legible over dark floating surfaces.
- Both render paths add `bg-muted rounded-md`, keeping the backing opaque and the radius aligned
  with the compact icon size.
- `pnpm exec vp run @agentstart/client#typecheck`, `pnpm check`,
  `pnpm exec vp run @agentstart/extension#build`, and `git diff --check` passed. The extension build
  emitted the new `favicon-*.png` asset; no tests or validation harnesses were added.

## System primary color fallback correction — 2026-09-12

- [x] Remove the fixed orange fallback from the browser client's primary token.
- [x] Keep native system-accent and workspace-palette overrides working while using the semantic
      ChatGPT/Codex accent token when a host cannot expose a native accent.
- [x] Run formatting, client typechecking, repository checks, and extension build validation.
- [x] Record the visual review and verification boundary.

## System primary color fallback correction review — 2026-09-12

- Superseded by the later Theme-token audit below after visual review showed that the native accent
  could override AgentStart's product primary with an unrelated brown system color.
- Browser `--brand` now defaults to the semantic `--accent-foreground` token instead of a fixed
  orange value. A connected local daemon still replaces it with the normalized native system
  accent, and a selected workspace palette still owns its local brand override.
- `pnpm exec vp fmt packages/client/src/assets/main.css`,
  `pnpm exec vp run @agentstart/client#typecheck`, `pnpm check`,
  `pnpm exec vp run @agentstart/extension#build`, and `git diff --check` passed. The extension
  production build completed with the updated token path; no tests or validation harnesses were
  added.

# Workspace tool tabs and sidebar removal — 2026-09-12

## Plan

- [x] Inventory the current workspace sidebar terminology, state, routes, shortcuts, and panel
      ownership; record every historical `rightSidebar`/`WorkspaceSidebar` name that lies about the
      rendered position or new responsibility.
- [x] Rename the workspace panel state, route helpers, activity items, runtime-owner helpers, and
      component files to truthful `workspacePanel`/tool-panel names with no compatibility aliases.
- [x] Model Files, Changes, and Agents as fixed workspace tool tabs at the leading edge of every
      center tab strip, while preserving the existing terminal/editor/browser tab records and pane
      behavior.
- [x] Remove the left sidebar shell, width persistence, resize chrome, and collapsed-sidebar spacer;
      keep the independent right navigation sidebar intact.
- [x] Apply the reference chrome: a distinct rounded island around the three leading tool tabs, a
      seamless active tab/body surface for selected content tabs, and stable overflow/keyboard
      behavior.
- [x] Migrate callers, URLs, crash context, polling gates, localization namespaces where needed,
      and verify formatting, typechecking, repository checks, and the extension build.

## Review

- Renamed the historical `rightSidebar`/`WorkspaceSidebar` state, routes, files, and callers to
  truthful `workspacePanel`/workspace-tool-panel names. Persisted daemon UI keys now use the same
  vocabulary; the generated crash-report wire field remains mapped explicitly for compatibility.
- Removed the left workspace-panel shell and its width/resize persistence. The independent
  right-side navigation (`SidePanelNavigation`) remains the only sidebar surface.
- Added a fixed rounded island containing Agents, Changes, and Files at the leading edge of every
  center tab strip. Selecting a tool tab swaps the focused pane body into the workspace panel;
  activating a normal terminal/editor/browser tab closes the tool panel and restores its content.
  Terminal overlays are gated while the tool panel is visible.
- Existing content-tab chrome keeps the selected tab and body on the same background surface, while
  the new tool island has its own border, muted fill, and pill-shaped segmented buttons.
- Verification boundary: the full `pnpm check` gate (including daemon clippy and Swift build) was
  green for the preceding workspace-panel migration; after the crash, style, and localization
  edits, the client typecheck, targeted formatting/lint, extension production build (with its
  existing chunk-size warning), and `git diff --check` passed. No tests or validation harnesses
  were added, per repository policy.

# Session document conflict on startup — 2026-09-12

## Plan

- [x] Trace the `SessionDocumentClient.get` conflict path and identify which startup sync races
      with the external Claude Code client.
- [x] Make the read/sync boundary tolerate a recoverable concurrent edit without creating an
      unhandled renderer rejection or discarding the external client's changes.
- [x] Verify the fix with the repository gates that cover the touched package and record the exact
      validation boundary.

## Review

- Root cause: workbench `SidePanelNavigation` and app startup both hydrated the same session, and
  `SessionDocumentClient.get` escalated a pending-edit merge conflict into a rejected startup
  promise. Workbench presentation now leaves hydration to the app startup owner; browser side-panel
  hydration remains independent. Reads retain the newer external snapshot and local pending value,
  while epoch replacement remains a hard conflict.
- Verification: `pnpm exec vp run @agentstart/client#typecheck` passed after the conflict fix;
  `git diff --check` passed after the visual changes. The full repository gate and extension build
  were already green for the preceding workspace-panel migration; no tests or validation harnesses
  were added, per repository policy.
- Final visual polish moved the workspace-tool button geometry into the shared Button primitive so
  the rounded island, selected state, and focus treatment remain consistent at every call site.
- Historical localization IDs were migrated with the locale tree: all workspace-panel callers now
  resolve through the `workspacePanel` namespace, while crash-report protocol compatibility names
  remain explicitly mapped rather than being renamed in the wire contract.

# UI input validation crash — 2026-09-12

## Plan

- [x] Trace the invalid UI input fields across old extension bundles and the daemon schema.
- [x] Normalize legacy workspace-panel fields at the daemon boundary.
- [x] Consume best-effort feature persistence failures so expected validation errors cannot become
      renderer-wide unhandled rejections.
- [x] Verify the client and daemon formatting/type boundaries.

## Review

- Root cause: an older extension bundle could still send `rightSidebar*` fields during reload after
  the canonical state moved to `workspacePanel*`; the daemon rejected those fields as unknown.
- The daemon now accepts those legacy wire names only as an input migration and persists canonical
  `workspacePanel*` keys. Feature-interaction persistence remains local-first and logs validation
  failures without crashing the renderer.
- Verification: client TypeScript typecheck, daemon `cargo fmt --check`, and `git diff --check`
  passed. No tests or validation harnesses were added.

# Titlebar icon sizing correction — 2026-09-12

## Plan

- [x] Remove full-height sizing from the trailing titlebar icon actions.
- [x] Use the shared default Ghost/Icon button treatment without a titlebar-specific radius or seam.
- [x] Recheck the rounded active tab and transparent inactive tab classes alongside the correction.

## Review

- Trailing Open in, quick-command, and split-close actions now use intrinsic `icon-sm` buttons with
  the shared `ghost` variant; their plain flex wrappers no longer stretch them across the titlebar
  or impose ButtonGroup edge treatment.
- The active content tab remains a fully rounded surface and inactive tabs remain transparent.
- Verification: client TypeScript typecheck and `git diff --check` passed. No tests were added.

# Tab bar surface alignment — 2026-09-12

## Plan

- [x] Match the full center tab bar background to the right navigation panel surface token.
- [x] Keep the active content tab on the contrasting content surface.
- [x] Verify the pane frame and affected client package.

## Review

- The complete titlebar/tab strip now uses `bg-sidebar`, matching the right navigation panel while
  the content body remains on `bg-background` and the selected tab keeps its surface contrast.
- Verification: client TypeScript typecheck and `git diff --check` passed. No tests were added.

# Trailing action edge inset — 2026-09-12

## Plan

- [x] Match the trailing action group's edge gap to the leading tool island inset.
- [x] Keep the change as a layout margin without changing button geometry or interactions.
- [x] Verify the workspace pane frame and affected client package.

## Review

- The trailing action wrapper now applies `mr-1`, matching the leading island's `ml-1` so the
  rightmost icon no longer touches the pane edge.
- Verification: client TypeScript typecheck and `git diff --check` passed. No tests were added.

# Tab strip spacing and selected surface — 2026-09-12

## Plan

- [x] Add a visible gap between the leading tool island and the content-tab strip.
- [x] Remove the selected tab's heavy border/shadow treatment while retaining full rounded corners.
- [x] Verify the shared tab classes and panel layout.

## Review

- The center strip now uses `gap-2` between the tool island and content tabs, matching the reference
  separation instead of allowing the two groups to touch.
- Selected content tabs now use a clean `rounded-2xl` surface with no border or heavy drop shadow;
  inactive tabs remain transparent and the selected surface still contrasts with the content plane.
- Verification: client TypeScript typecheck and `git diff --check` passed. No tests were added.

## Follow-up

- Selected tabs now overlap the titlebar seam by 1px so their lower rounded edge blends into the
  content plane; only a shallow outer shadow remains around the selected surface.

# Selected tab/content merge refinement — 2026-09-12

## Plan

- [x] Remove the full-width titlebar divider that leaks through the selected tab/content join.
- [x] Keep the selected tab's lower overlap while limiting its shadow to the top and side edges.
- [x] Run formatting, client typecheck, and diff validation.

## Review

- The pane frame no longer paints an independent bottom seam; the selected tab can now extend into
  the content plane without a divider or shadow at the connection.
- The selected tab keeps its rounded lower edge and now drops four pixels into the body, while its
  outer shadow is limited to a barely visible top/left/right contour.

## Final visual calibration

- The selected tab now uses inverse quarter-arc connectors at both lower corners, giving the white
  surface the outward browser-tab transition while keeping the connection free of a divider and
  bottom shadow.
- Verification: targeted formatting, client TypeScript typecheck, and `git diff --check` passed.

# Browser-style tab corner connectors — 2026-09-12

## Plan

- [x] Replace the selected tab's ordinary lower capsule corners with inverse quarter-arc connectors.
- [x] Keep the content surface continuous and leave drag insertion indicators available.
- [x] Run formatting, client typecheck, and extension production build.

## Review

- Selected content tabs now end on the content-plane boundary with square lower edges; a shared
  `TabContentMerge` layer supplies the left/right inverse arcs that expand outward into the chrome.
- The connector layer uses real content background with no bottom border or shadow, while the
  existing drag-indicator pseudo-elements remain available on every tab root.
- Verification: `vp fmt`, client TypeScript typecheck, extension production build, generated CSS
  inspection for both clip-path arcs, and `git diff --check` passed. The build retains its existing
  chunk-size warning.

## Follow-up calibration

- Reduced both inverse connectors from 20px to 12px so the lower corner arc matches the reference
  at the rendered device scale instead of becoming an oversized semicircle.

## Correct arc direction and verify rendered chrome

- [ ] Replace the convex corner paths with concave paths tangent to the tab sides and content baseline.
- [ ] Keep corner scaling and scroll-viewport gutters consistent so the first and last shoulders remain visible.
- [ ] Inspect the actual rendered workspace and source-driven light/dark, narrow/wide examples; run package checks.

The previous size-only adjustment left the incorrect arc sweep intact. Build success did not verify
the requested contour; the preceding visual completion claims were premature.

# Workspace tool island depth — 2026-09-12

## Plan

- [x] Reduce the tool island's oversized pill radius to a restrained control radius.
- [x] Add the requested shallow inset edge treatment while keeping the icon-only buttons intact.
- [x] Verify the feature file and preserve the prior plain Ghost trailing-action treatment.

## Review

- The leading Agents / Changes / Files island now uses `rounded-lg` with a subtle inset edge shadow,
  matching the reference's recessed capsule without the previous full-pill geometry.
- Right-side actions remain plain default Ghost buttons outside any ButtonGroup.
- Verification: client TypeScript typecheck and `git diff --check` passed. No tests were added.

## Follow-up

- Reduced the island radius one step further to `rounded-lg` at the user's request; the inset edge
  treatment remains unchanged.
- Reduced the inner workspace-tool buttons to `!rounded-sm` and removed their duplicate size-level
  radius so the controls stay inside the island contour.
- UI persistence input now accepts legacy `rightSidebar*` payloads from older extension bundles,
  canonicalizes them to `workspacePanel*`, and prevents rolling-reload clients from triggering
  `UI input validation failed`.

# Tab hover separation — 2026-09-12

## Plan

- [x] Move inactive-tab hover paint into an inset surface so it cannot touch the selected tab.
- [x] Preserve drag insertion pseudo-elements and keep tab text/icon positions unchanged.
- [x] Run the focused client checks and verify the generated extension includes the inset surface.

## Review

- Inactive tabs now render an independent inset hover surface with six-pixel horizontal breathing
  room and a small vertical inset. The root tab only changes text color, so adjacent tab chrome no
  longer becomes one continuous highlighted block.
- The hover surface is rendered as a child instead of a root pseudo-element because the tab roots
  already reserve `::before` and `::after` for drag insertion indicators.
- `vp lint` (focused tab files), client typecheck, full workspace typecheck, extension build, and
  `git diff --check` passed. The live extension reload currently remains on its existing connecting
  surface, so no unobserved browser screenshot is being presented as visual proof.

# Tab close inset and switch stability — 2026-09-12

## Plan

- [x] Trace the close-button edge spacing and the active-state layout transition.
- [x] Remove any state-dependent geometry or transition that moves tab content on activation.
- [x] Apply the smallest shared fix and run the focused checks.

## Review

- The shared close-button overlay now uses `right-2`, moving its 20px hit area eight pixels inside
  the tab edge without changing tab width.
- Active and inactive tab roots now share the same full-height flex box. The selected silhouette's
  visual layer supplies its four-pixel top inset independently, so switching state cannot move the
  icon, label, or close control.
- Focused lint, client typecheck, extension build, and `git diff --check` passed. The live page was
  reloaded for inspection but remained on its existing connection surface, so no screenshot claim
  is being made beyond the compiled verification.

# Neutral tab close affordance — 2026-09-12

## Review

- Removed the accent background and resting accent text from the close overlay. It now uses the
  shared muted gray icon color while retaining the default Ghost hover/focus feedback.

# Neutral tab hover affordance — 2026-09-12

## Review

- Tab Hover now uses the neutral `muted` surface and foreground text on hover/focus instead of the
  themed Primary/Accent pair, preserving the existing inset spacing.

# Header button size consistency — 2026-09-12

## Plan

- [x] Trace the tab-strip scroll buttons and every regular Header icon control.
- [x] Replace the custom full-height scroll size and align the new-tab control with the shared
      intrinsic icon size.
- [x] Run focused formatting, lint, typecheck, extension build, and generated-bundle checks.

## Review

- Tab strip scroll controls now use the shared `icon-sm` size instead of the custom full-height
  `icon-tab-strip` variant; the unused variant was removed from the Button size map.
- The new-tab control also uses `icon-sm`, matching Open in, Quick Commands, and split-close
  controls. The 28px WorkspaceToolTabs controls remain intentionally scoped to their recessed
  island and are not mixed into the regular Header control row.
- Verification: `vp fmt`, focused `vp lint`, client TypeScript typecheck, extension production
  build, source/generated custom-size searches, and `git diff --check` passed. The extension build
  retains its existing chunk-size warning; no tests or validation harnesses were added.

# Tab scroll button centering — 2026-09-12

## Plan

- [x] Trace the vertical alignment and asymmetric gutters introduced by the intrinsic scroll-button
      size.
- [x] Center both scroll buttons through one shared full-height wrapper and mirror their horizontal
      spacing.
- [x] Run formatting, focused lint, client typecheck, and diff validation.

## Review

- Both scroll buttons now sit in matching full-height `items-center` wrappers with `mx-1`, so the
  intrinsic `icon-sm` hit areas are vertically centered and separated from the viewport and the
  neighboring Header controls symmetrically.
- Verification: `vp fmt`, focused `vp lint`, client TypeScript typecheck, and `git diff --check`
  passed. No tests or validation harnesses were added.

# Remove scroll-button divider rails — 2026-09-12

## Plan

- [x] Trace the vertical rails that appear only while the tab strip overflows.
- [x] Remove the leading border and trailing pseudo-element divider while preserving edge masks.
- [x] Run formatting, focused lint, client typecheck, and diff validation.

## Review

- The overflow viewport no longer adds a leading `border-l` or trailing pseudo-element rail, so the
  centered scroll buttons remain visually open on both sides while the existing fade masks continue
  to signal hidden tabs.
- Verification: `vp fmt`, focused `vp lint`, client TypeScript typecheck, and `git diff --check`
  passed. No tests or validation harnesses were added.

# Align right navigation below shared Header — 2026-09-12

## Plan

- [x] Trace the shell, workbench Header, and right navigation column hierarchy.
- [x] Identify that the first implementation only reserved Header height with a spacer.
- [x] Keep the right-panel resize affordance below the Header instead of extending into it.
- [x] Replace the spacer with a true shared Header host above the lower content row.

## Review

- Superseded by `# True shared workbench Header — 2026-09-12`. The earlier
  `pt-[var(--titlebar-height)]` implementation was a visual spacer, not a shared Header, and was
  removed after review.

# Extend Header surface across right navigation — 2026-09-12

## Plan

- [x] Identify the blank reserved Header band left above the shifted right Panel.
- [x] Remove the spacer and move the actual Header host above both lower columns.
- [x] Run formatting, focused lint, client typecheck, and diff validation.

## Review

- Superseded: painting a surface over a reserved blank band still left the layout structurally
  split. The replacement task below portals the focused tab Header into a shell-level host.

# True shared workbench Header — 2026-09-12

## Plan

- [x] Remove the spacer-only right Panel treatment and keep the resize handle inside the lower row.
- [x] Add a shell-level Header host above the main content and right navigation columns.
- [x] Render the focused split group's real tab Header in that host and hide pane-local duplicates.
- [x] Run formatting, focused lint, client typecheck, extension build, and diff validation.

## Review

- The shell now owns one real Header slot above the lower content row. The focused split group's
  Header is portaled into that slot, while pane-local Header rows are hidden only after the slot is
  mounted. The right navigation column remains a sibling of the main content below the Header, with
  its resize handle scoped to that lower row. The worktree-creation faux tab uses the same slot, so
  it does not reintroduce a content-only Header during creation.
- `vp run @agentstart/client#typecheck`, `vp run @agentstart/client#lint`, and
  `vp run @agentstart/extension#build` passed; the extension build was rerun after the shared
  creation Header was added and retains its existing chunk-size warning. `pnpm check` and
  `git diff --check` also passed; no tests or validation harnesses were added.

# Renderer crash: undefined workspace visibility symbol — 2026-09-13

## Plan

- [x] Trace every `isWorkspaceBodyVisible` reference and inspect the active shell migration diff.
- [x] Confirm whether the current working tree already contains the missing binding fix.
- [x] Apply the smallest application-shell correction only if the crash remains reproducible in source.
- [x] Run focused format, lint, typecheck, extension build, and diff validation.

## Review

- Root cause: the workspace-surface migration briefly saved the new
  `isWorkspaceBodyVisible(...)` call before its import. WXT HMR evaluated that intermediate module,
  and the root error boundary captured the resulting bare-identifier `ReferenceError`.
- The report was created at 13:05:22 local time; `shell.tsx` was saved at 13:07:49 with the missing
  import from `state/visible-surface`. The current source therefore already contains the minimal
  repair, and no duplicate compatibility or fallback code was added.
- `vp run @agentstart/client#typecheck`, full client lint, the extension production build,
  `pnpm check`, and `git diff --check` passed. The extension build retained its existing chunk-size
  warning. Browser-level localhost verification was blocked by the in-app browser policy, so it is
  not claimed as completed; no tests or validation harnesses were added.

# Header island and tab/content join — 2026-09-14

## Plan

- [x] Trace why the selected tab read as a pill detached from the content card.
- [x] Remove the band painted across the join and correct the merge silhouette's clipped geometry.
- [x] After review, split the header off into its own island and give the selected tab a legible surface.
- [x] Align the worktree-creation faux tab with the same chrome, then run the gates.

## Review

### Round 1 — the join itself

- Root cause 1: `WorkspaceSharedHeaderSlot` carried its own downward shadow
  (`0 4px 14px -4px black 9%`). The content card started flush beneath that row, so the shadow
  painted a soft band exactly across the join — the tab ended on the strip's baseline while the
  card's first pixels were darkened.
- Root cause 2: `TabContentMerge` painted its surface 20px past the strip's bottom edge and placed
  both concave shoulders on that far edge. The strip is a horizontal scroll container
  (`overflow-x-auto` + `overflow-y-hidden`) inside two `overflow-hidden` wrappers, so everything
  below the baseline was clipped — the shoulders never rendered and the silhouette could never
  bridge the join.
- Geometry proof (session-scoped static harness, scratchpad only, nothing added to the repository):
  loaded the built `client-*.css`, rebuilt the real DOM chain, and measured rects. Pre-fix the
  shoulders sat at y 46–58 inside a 38px strip (outside the clip, so never painted) with the
  surface overshooting 20px; after the fix they occupied y 26–38 and the surface's bottom edge
  equaled the card's top edge with a 0px gap. A red-fill probe confirmed the inverse-corner paths.

### Round 2 — the structure the review asked for

- The first round made the strip and the content one surface. Review rejected that: the header must
  be *distinguished* from the content and read as **a piece of content floating on the background**.
- `workspace-shell-layout.tsx` now owns the gutters: the chrome plane row carries
  `p-1.5 gap-1.5` with the header island and the content island as its two children, so the plane
  itself separates them. The content island dropped its `mx-1.5 mb-1.5` for that padding.
- `WorkspaceSharedHeaderSlot` is that header island: it wears the shared
  `workspace-content-card` surface (radius + sanctioned shadow), which is what makes it read as a
  piece rather than as a background band.
- `TabContentMerge` is replaced by `TabActiveSurface`: the header has no content below it to merge
  into, so the selected tab is a control on the island and carries the same recessed treatment the
  workspace tool island uses (filled `card`, hairline border, shallow shadow). All six call sites
  were renamed with it.
- The worktree-creation faux tab renders that same surface, so an in-progress create reads as the
  selected tab on the header island.
- `docs/style-guide.md` and the `.workspace-content-card` comment now describe the two-island
  figure-ground and the tab's recessed surface.
- Verification: `vp fmt`, `vp lint` (0 warnings, 0 errors), the workspace typecheck graph
  (`vp run --cache -r typecheck`, extension and client both cache-missed and passed),
  `vp run @agentstart/extension#build`, generated-CSS inspection (the selected surface's
  `border`/`card`/shadow classes are present in the rebuilt bundle), a `git diff --check` pass, and
  an A/B harness capture of both candidate tab treatments against the rebuilt CSS.
- Real Chrome rendering of the running extension was not verified in this session; the harness
  reproduces the markup and CSS but not the app's state. No tests or validation harnesses were
  added to the repository.

# Real Chrome page-tab verification — 2026-09-13

## Plan

- [ ] Verify the no-workspace tool island and trailing controls are visible, disabled, and explain why.
- [ ] Activate the existing workspace and verify selected-tab/content fusion without dual selection.
- [ ] Verify page-tab persistence across a real extension reload.
- [ ] Verify dragging a page tab into a split in the Chrome extension runtime.
- [ ] Record observed results and run repository validation if a correction is required.

## Review

- Pending real Chrome verification.

# Restore the tab/content merge across the header — 2026-09-14

## Plan

- [x] Recover the merge-era geometry (inverse arcs, baseline join, zero shadow at the join) from the
      Round-1 record and the lessons file; rebuild it in source.
- [x] Put the header back on the chrome plane and start the content card on the row's baseline, so
      the selected tab's silhouette can cross the join instead of ending on its own island.
- [x] Add the reference tab's top-and-sides shadow as a masked layer that keeps the join clean.
- [x] Match the reference tab metrics: full-width fill, 12px padding, content-hugging widths, and no
      extra gap between the tool island and the strip.

## Review

- Measured from the reference screenshot (1728px-wide window, 1 image px ≈ 1.44 CSS px): strip height
  ≈ 37.5px, tab top inset ≈ 3px, tab corner radius ≈ 9-10px, fill edge → glyph ≈ 12px, glyph → glyph
  ≈ 23px, shadow ≈ 2-3px around the top and sides.
- `TabActiveSurface` now resolves through a plane/card scope: on the plane it renders the merge
  silhouette (full-width body ending on the baseline, two 12px inverse arcs, masked top-and-sides
  shadow), and on the content card — a pane-local strip in a split, which has no plane to flare into
  — it keeps the recessed control surface, because a white tab on a white card disappears.
- Tab padding moved to the reference's 12px (`TAB_ROOT_CLASSES`), the neighbor gap is the two
  paddings (24px), and the tab container floor dropped from 128px to 56px so a short title no longer
  leaves a trailing box that reads as an oversized gap. The 8px gap beside the tool island is gone;
  the strip's own 12px gutter is the separation, and it is exactly what a selected first tab's outer
  arc flares into.
- Verification: `vp fmt`, client lint, client typecheck, extension build, and a scratchpad harness
  that loads the built `client-*.css` and reproduces the DOM chain. Measured in that render: body
  bottom → card top = 0px, 12px content padding on both sides, shoulders 12x12 at -12..+12, first
  tab's shoulder flush with the strip's padding edge (unclipped), top shadow fading 248 → 231 toward
  the tab edge, side shadows 248 → 237, and the join under the tab a clean 255 with no band. Live
  Chrome rendering of the running extension was not verified in this session; the harness reproduces
  the markup and CSS but not the app's state. No tests or validation harnesses were added to the
  repository.
