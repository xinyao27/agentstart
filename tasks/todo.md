# AgentStart 0.1.0 handoff completion

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
- The automatically triggered GitHub Actions run `34607301627` passed checkout, Vite+ setup,
  dependency installation, and typecheck, then failed because the repository secret
  `CLOUDFLARE_API_TOKEN` is empty. A live `curl` check could not resolve the custom domain from
  this environment, so DNS/edge reachability remains externally unverified.


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
