# Lessons

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
