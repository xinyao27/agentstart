# Lessons

- When top-level pages move from URL-owned routes into the unified tab queue, migrate external host
  navigation and browser-tab selection in the same change. A `?view=` parameter may remain as
  cold-start intent, but it must not also remain the persistent Chrome Tab identity.

- When a screenshot shows hover paint touching a neighboring selected tab, do not tune the selected
  silhouette alone. Keep hover paint in a separate inset layer with explicit horizontal breathing
  room, and account for any pseudo-elements already owned by drag/drop affordances.

- When a tab appears to shift during activation, compare active and inactive box geometry before
  changing transitions; state classes must preserve the same hit-area width and content alignment.

- Keep tab close affordances on the neutral icon-button surface: do not reuse the accent background
  or accent resting text color for a control that is only revealed by hover.

- Keep tab hover surfaces on the neutral `muted` token as well; the product accent is reserved for
  explicit primary actions and should not tint passive tab navigation.

- For a shared Header row, use the existing common icon size for scroll and create controls instead
  of adding a full-height custom variant; keep smaller sizes only for an explicitly bounded island.

- When an intrinsic Header icon replaces a full-height variant, center it through a full-height
  wrapper and mirror the wrapper's horizontal gutters so both sides keep the same breathing room.

- When overflow controls are visually separated by gutters, use the edge mask alone for scroll
  feedback; explicit divider lines beside the icon buttons add unintended rails to the Header.

- When a right navigation column must sit below a content-owned Header, reserve the Header band in
  the column's layout and keep its resize affordance inside the lower panel instead of extending a
  negative top hit area across the shared Header.

- When extending a content Header over a sibling column, carry its surface and seam into the
  reserved band; matching only the vertical offset leaves a visually empty, disconnected strip.

- When a product owner identifies a historical name as semantically wrong, do not preserve it as a
  compatibility alias. Rename the state, routes, files, and callers together so the code's names
  continue to describe the rendered location and ownership after the UI migration.

- Do not describe repository gates, cross-platform builds, or compile-only simulator checks as
  complete end-to-end validation. State the exact verification boundary, explicitly note that this
  repository forbids retained tests, smoke checks, and E2E harnesses, and separate repository-ready
  status from unverified real-user flows and external publishing.
- When a visual correction is reported from a screenshot, inspect the owning feature and its
  neighboring surfaces against the style guide; fix the shared visual boundary and only extend the
  treatment to directly related inline panels, leaving edge-to-edge panes intentionally square.
- For page-level visual corrections, inspect the outer content wrapper before changing individual
  cards; missing inset belongs on the page shell so the entire vertical rhythm moves together.
- When a shared session document contains both renderer-owned layout and daemon-owned terminal
  bindings, merge those fields by ownership; otherwise a harmless PTY update can surface as a
  recurring manual conflict even when no user edits actually collide.
- Keep an outer bootstrap rejection boundary around extension startup; any error after the
  connecting surface is replaced must still render actionable connection guidance instead of
  rejecting into a blank workspace root.
- When a release conductor pins an exact toolchain, run the user's requested upgrade command but
  preserve the release evidence and call out when the newly installed version is newer than the
  release gate; do not silently weaken the gate or claim the release completed.
- For Google OAuth projects in Testing, explicitly verify that the exact Chrome Web Store owner
  account is listed under Test users before starting OAuth Playground; telling the user to sign in
  with the owner account alone does not grant a Testing-project authorization.
- Check subcommand-specific GitHub CLI syntax against the installed binary; `gh repo view` takes
  the repository as a positional argument here, even though other `gh` subcommands accept
  `--repo`.
- Treat Chrome Web Store OAuth success and publisher authorization as separate checks: a valid
  token can still receive 403 when `CWS_PUBLISHER_ID`, item ownership, or the Google account used
  to mint `CWS_REFRESH_TOKEN` does not match the publisher that owns the extension.
- For the first Chrome Web Store item upload, remove the manifest `key`; after the item is created,
  adopt the public key shown in its Package tab for development builds and keep the generated item
  ID synchronized across the extension, native messaging, and release metadata.
- When preparing a Chrome Web Store listing, cover the Privacy practices tab as well as Store listing:
  provide a single-purpose statement and a separate, implementation-backed rationale for every
  required permission, optional permission, and host-access group.
- In a Chrome Web Store listing, distinguish the homepage URL from the product name: when a user
  recalls a former website, inspect repository history and the live domain before reusing it. A
  retired brand domain can remain deployed while its source and deploy workflow have been removed.
- Treat a later owner-provided domain as authoritative: once `agentstart.ai` was confirmed as an
  available Cloudflare zone, update `SITE_ORIGIN`, Worker routes, canonical redirects, robots, and
  sitemap together instead of retaining the historical `yiru.ai` host.
- For brand assets, prefer the repository's source-of-truth icon for favicon and page branding. When
  an OG card needs a supplied art direction, pass that icon as the image-generation reference and
  inspect the result so the rendered character stays recognizable instead of becoming an unrelated
  mascot.
- For a visual reference correction, preserve the exact product subject but match the reference's
  composition and lighting language; a logo-only card or an unrelated generated mascot misses the
  requested art direction even when the metadata and dimensions are correct.
- If the source brand asset is an avatar crop rather than a full character illustration, keep it as
  an explicit avatar badge in the composition instead of asking image generation to invent missing
  anatomy.
- When an owner specifies a corner placement and minimum scale, treat those as hard layout
  constraints: remove the source matte with a transparent cutout and size the avatar against the
  full OG canvas, rather than leaving a small white-backed badge.
- If the owner explicitly asks for the image-generation model for artwork, use that generation path
  for the final asset itself; do not substitute a manually composited preview after showing it.
- When the owner asks for product-positioning imagery, replace generic sci-fi scenery with
  domain-specific visual cues such as terminal/editor panes, Git worktrees, and agent status while
  preserving the logo placement and scale constraints.
- For compact logo surfaces, use the shared gray-backed favicon on an opaque semantic muted surface
  with a component-appropriate radius; the square matte of the wordmark bitmap is visibly wrong in
  dark menus and tooltips.
- Keep shared browser controls on the stable AgentStart primary token; a native system accent can
  be an unrelated user-selected color and should not override product theming. Workspace palettes
  remain the explicit scoped override.
- For repeated corner-radius feedback, audit the shared group/segmented primitives and nearby
  standalone cards together; round and clip the owning boundary, while leaving edge-to-edge panes
  and divider-only layouts intentionally square.
- For settings layouts, keep the navigation rail anchored to the viewport edge and let the content
  pane consume the remaining width; avoid centering a capped shell that creates asymmetric blank
  space on wide windows.
- For large AI Vault history lists, request compact records at the browser boundary and keep a
  daemon-side frame-budget fallback; a verbose unary response can exceed the 1 MiB transport limit
  even when the individual session records are valid.
- When product primary changes, audit the separate `accent` pair too: hover and selected rows often
  consume `--accent-foreground` directly, so updating only `--primary` leaves a visible legacy hue.
- Keep provider usage presentation independent per provider: a transient failure in one usage store
  must not blank valid data from the other stores, and initial runtime reads need a reconnect retry
  instead of relying on a one-shot effect.
- When a status-bar surface is gated by data it is supposed to fetch, initialize that data from app
  startup or another reachable path; a dropdown that only appears after providers exist cannot be
  the first refresh trigger.

- When a visual reference calls for a tab/content transition, audit the shared tab boundary rather
  than only changing individual labels: the selected tab needs an intentional rounded edge and a
  deliberate seam into the content surface, while the leading tool controls need their own clearly
  bounded island.
- Treat a concurrent session edit discovered during a startup read as recoverable state. Preserve
  the newer external snapshot and the local pending edit, but do not let an expected merge conflict
  escape the hydration promise as an unhandled renderer rejection.
- When renaming a localization namespace, migrate source IDs and locale trees together; otherwise
  non-default languages can silently fall back even though the UI still renders.
- Keep unavailable-surface retry scheduling in one timer chain; state-driven effects can cancel and recreate timers during retry transitions, causing visible connection jitter. Preserve disclosure state when the failure surface is remounted so user-expanded diagnostics do not collapse.
- During rolling extension reloads, daemon input schemas must normalize legacy field names at the
  boundary; otherwise an old bundle can turn a harmless UI persistence write into a renderer crash.
- Best-effort telemetry and UI interaction persistence must always consume their Promise rejection;
  expected validation failures should be logged and surfaced through state, never as unhandled errors.
- When a compact toolbar is embedded in a taller titlebar, use intrinsic shared icon sizing and
  centering; a dedicated `h-full` size or radius makes the hit area read as an unintended tab cell.
- Never report a UI correction from intent alone: inspect the rendered call site's actual diff after
  each follow-up, because a shared style can remain overridden by a stale size or variant at the
  component boundary.
- If the requested control explicitly has no grouping treatment, do not introduce a new ButtonGroup
  while trying to fix its edge geometry; use the existing default button style and plain layout.
- When a visual reference explicitly calls for an inset shadow, keep it shallow and scoped to the
  owning island; reduce an over-large pill radius at the same boundary instead of rounding children.
- Treat corner-radius feedback as iterative visual calibration: change only the owning boundary's
  radius while preserving the requested depth and button geometry.
- When an island radius changes, retune child control radii in the shared Button variant; leaving a
  larger child radius in place can make active backgrounds visually protrude through the shell.
- Mirror leading and trailing chrome insets at the owning pane frame so edge spacing stays balanced
  without adding padding to individual icon buttons.
- Treat a tab island and content-tab strip as separate layout groups: own their inter-group gap in
  the parent flex layout, and let selected-state contrast carry the active surface without shadows.
- For a selected tab that should merge into content, extend its visual box across the seam instead
  of drawing a divider; keep any requested shadow shallow and on the outer edge only.
- When reviewing a screenshot against a reference, distinguish a state tint from structural chrome;
  call out the remaining seam, boundary shape, and active-surface geometry before claiming parity.
- When a user asks for a surface to match an adjacent panel, reuse that panel's semantic background
  token at the owning frame instead of approximating the color in child tabs.
- A full-width titlebar seam can remain visible at the selected tab/content join; remove the divider
  at the owning pane frame and keep the selected tab's shadow on its outer top and side edges only.
- A browser-style active tab is not a capsule with a larger radius: its lower corners are inverse
  arcs that expand the content surface into the surrounding chrome, so model those connectors as
  separate geometry instead of only tuning the root border radius.
- Never simulate a shared Header by adding top padding or painting an absolutely positioned spacer
  over a sibling Panel. Lift the actual Header host above the lower split and render its controls
  there so the layout, hit targets, and panel boundaries share one structure.
- Verify the arc sweep and endpoint tangents before tuning size: reducing a convex quarter-circle
  cannot produce a concave tab shoulder. Use a scalable viewBox for path geometry and inspect actual
  rendered first/middle/last tabs, including clipping ancestors. Build success is not visual proof.
- A tab strip that scrolls horizontally clips vertically too (`overflow-x: auto` takes the other
  axis off `visible`, and the shell wraps it in `overflow-hidden`), so a merge silhouette drawn
  past the strip's baseline is never painted — the shoulders vanish and the tab looks detached
  even though the classes are correct. Draw the whole silhouette inside the strip's box and end it
  exactly on the baseline the content card starts on.
- Treat a shadow on the strip row itself as paint across the tab/content join: the card starts
  flush under that row, so a downward shadow there darkens the card's first pixels beneath the
  selected tab and reads as a gap. Keep the join's shadow budget at zero and put elevation on the
  card's own outer edges.
- "This surface's color doesn't match" has two opposite fixes: unify the surfaces, or separate
  them so each reads as its own piece. Ask which one (and which surfaces are peers) before
  restructuring — merging the header into the content and floating the header as its own island
  both remove the seam, but only one of them is what the reviewer meant. Render both variants and
  show them when the cost of guessing is a layout change.
- When a surface loses the contrast it was drawn against, its selected state has to change with
  it: a tab merged into the content below is legible because it is white against the plane, but the
  same tab on a white island disappears. Give the selected control the recessed treatment the
  sibling controls on that surface already use instead of inventing a third language.
- `mask-image` only paints inside its own box and its tile repeats, so masking a shadow on the
  shadow's own box silently erases every side shadow that falls outside that box, and repeats the
  transparent bottom band over the top edge. Mask a wrapper that spans the full row plus the
  shape's own overhang, and position the shadow layer inside it back onto the shape's box.
- When a tab silhouette is drawn from a screenshot, get the reference's pixel scale from a known
  metric (traffic-light diameter, strip height) before trusting any measurement: a 1200px-wide
  capture of a 1728px-wide window is 1.44 CSS px per image px, and reading it as 1:1 makes every
  padding look 44% too large.
- A fixed minimum tab width wider than the label's content shows up as an oversized gap between
  neighbors even when every padding is correct, because the viewer measures glyph to glyph. Size
  tabs to their content with a small floor, and let truncation handle a saturated strip.
