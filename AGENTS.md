# AGENTS.md

AgentStart is a Rust daemon with a Chrome MV3 workbench and a native SwiftUI iOS companion for running
coding agents across many git worktrees on local, WSL, and SSH hosts.

This file is the contract for every agent writing code here: structure, naming, cohesion, code
quality. For browser visual work, [`docs/style-guide.md`](./docs/style-guide.md) is canonical. For
mobile visual work, use [`apps/mobile/DESIGN.md`](./apps/mobile/DESIGN.md). For the daemon's runtime
ownership and transport boundaries, [`apps/daemon/ARCHITECTURE.md`](./apps/daemon/ARCHITECTURE.md).

**The organizing principle.** Tailwind won because the style lives next to the markup: one place to look, one place to change. Apply that to all code. A feature's directory, filenames, and module boundaries exist so an agent can find the code from the feature name alone and change it without touching the rest of the tree. Optimize for *"where does this live?"* being answerable in one guess.

---

## Read first

These are hard rules regardless of who enforces them. Some fail CI; the rest are convention plus
review. The table says which is which — "no automated check" does not mean "not a rule." No
exceptions inside a feature task.

| Never | Enforced by |
| --- | --- |
| Write or retain any test, smoke check, E2E harness, or validation-only script. | Section 9 |
| Add an `eslint-disable`/`oxlint-disable max-lines`, a max-lines baseline, or a `#[allow(…)]` that silences clippy | Convention only |
| Add a hand-written project-owned `.d.ts`; generated platform bindings are the only exception | Convention only |
| Add a variable to the `@theme inline` block in `packages/client/src/assets/main.css` | Convention only |
| Use a native `<button>`/`<input>`/`<textarea>`/`<select>` in client feature TSX; use `bg-black/N`-style alpha washes; import `ui/*-styles.ts` from feature code | Convention only |
| Use `interface`, `enum`, `namespace`, or `any` | oxlint + `erasableSyntaxOnly` |
| Write `unsafe`, `.unwrap()`, or `panic!` in daemon code | `unsafe_code = "forbid"` + Section 4a |
| Ship a user-visible string that isn't wrapped in `t()` / `translate()` | Convention only |
| Hardcode `e.metaKey`, a path separator, or a platform font | Section 7 |
| Import daemon or extension-host implementations from `packages/client/src` | Section 1 |
| Reach a client or host across the process boundary through anything but a protobuf capability declared in `packages/protocol/proto/` | Section 1 |
| Name a file or folder `helpers`, `utils`, `common`, `misc`, or `shared-stuff`; add an `index.ts` re-export barrel | Section 2 |
| Rename or move a file without updating the paths written as *strings* — build scripts, CI jobs, allowlists, `Why:` comments | Convention only |
| Follow an absolute path from a subagent result into the main repo instead of this worktree | Section 12 |

---

## 1. Structure: a feature is a folder

```
apps/
  computer-use-macos/
                standalone signed SwiftPM helper for macOS accessibility and screen capture
  daemon/       Rust runtime, CLI, Native Messaging host, host adapters, and authoritative state
  extension/    WXT-managed Chrome MV3 host: background, side panel, DevTools, browser bootstrap
  macos/        SwiftPM menu bar host that supervises the daemon binary on macOS
  mobile/       native SwiftUI app and widgets
packages/
  client/       source-only browser workbench UI consumed through declared exports
  protocol/     protobuf source of truth plus generated Swift, Rust, and TypeScript bindings
  cli/          npm/bunx installer shim for compiled daemon releases
skills/         agent skill packages shipped to end users, one folder per skill
scripts/        workspace-level tooling whose inputs cross package boundaries
```

**Scripts live at the level they serve.** `scripts/` holds only tooling whose inputs cross app
boundaries, and the root `package.json` owns their npm scripts. Everything
scoped to one app lives in that app's own `apps/<app>/scripts/`, invoked from
that app's `package.json`. A script that reaches outside its app is in the wrong
folder; `config/` is for configuration, never executables. A script also has to earn its file:
if a one-line `package.json` task can express it, it does not exist — and every surviving script
opens with a `Why:` line naming the reason it can't be one. An unexplained script is a deletion
candidate. Durable scripts exist only for necessary product workflows such as starting, building,
packaging, publishing, deploying, or generating application artifacts. A script written only to
verify a task is temporary: run it, remove it before finishing, and never add it to a package script
or CI workflow.

`skills/<name>/SKILL.md` is product content, not app source. It sits at the repository root because
it is shipped to users' agent installs rather than built into one client, and it is the source of
truth for that skill.

**Import direction is one-way.** `packages/client` may import pure contracts and models, but never
`apps/extension`, Node, or Chrome globals — and `apps/daemon` is a separate Rust binary it cannot
import at all, only call over the protocol. `apps/extension` imports only declared
`@agentstart/client` exports and owns browser APIs, Native Messaging bootstrap, and capability adapters.
`apps/daemon` owns filesystem, git, process, PTY, persistence, and runtime capability effects.
`packages/protocol` stays pure and never imports an app. Its `proto/` tree is the only source of
truth for cross-language wire messages and method policy. After bootstrap, client-to-daemon
capability traffic uses binary Protobuf frames over the authenticated WebSocket; the iOS adapter
places the same frames inside the existing E2EE transport. Real sockets, authentication, and E2EE
remain in their owning apps.

Capability changes update their protobuf schema, generated bindings, owning authority, and active
callers together. Keep one authenticated binary capability path across Chrome and iOS.

`@agentstart/client` is independently consumable source. Hosts import only its declared package exports;
they never reach into `packages/client/src`. Its `@agentstart/client/vite` preset owns source resolution,
React/Tailwind plugins, and client aliases, while the package owns its own `fmt`, `lint`, and
`typecheck` tasks. Changing client implementation must not require an extension-host edit unless the
bootstrap capability surface itself changes.

### Where a new file goes

Stop at the first yes:

1. **An existing feature owns this** → its folder. Not beside it, not in a sibling dump.
2. **It's a new feature** → create `<feature>/` in the right process root and put everything in it.
3. **It's genuinely cross-feature** → one level up, named for what it operates on (`capability-cache.ts`, `map-with-concurrency.ts`), never for a role.

A feature folder holds everything that belongs only to that feature — components, hooks, state, pure logic, constants, types, CSS — not split across `components/`, `hooks/`, `lib/`, and `store/` by technical role.

```
✓  components/source-control/           ✗  components/source-control-panel.tsx
     panel.tsx                              hooks/use-source-control-state.ts
     commit-form.tsx                        lib/source-control-diff.ts
     diff-list.tsx                          lib/source-control-staging.ts
     staging.ts                             store/slices/source-control.ts
     state.ts
```

Role-named folders (`hooks/`, `lib/`, `store/`) are for things used by three or more unrelated features.

Past ~15 files, a feature folder has sub-features inside it — nest them (`source-control/commit/`, `source-control/diff/`). A folder's entry point is named for the folder's job (`panel.tsx`, `pane.tsx`, `page.tsx`), never `index.tsx`: barrels hide the dependency graph and defeat tree-shaking.

### The touch budget

**A typical feature change should touch 1–3 files in one folder.** If a small behavior change needs a dozen edits, that's a structural defect — the feature is smeared across the tree, or you're editing the wrong layer.

Crossing the process boundary is the one legitimate multi-file change. Keep a runtime capability to
three touchpoints sharing one feature name: the schema in `packages/protocol/proto/agent_start/<feature>/`,
the handler in `apps/daemon/src/rpc/`, and the caller in `packages/client/src/`. A browser-owned
capability has the same narrow shape: client capability type, `apps/extension` implementation, and
feature caller. Keep Chrome APIs out of the source-only client package.

---

## 2. Naming

Filenames are lowercase kebab-case, always. Beyond that, files and symbols follow the same rules:

- **Name the thing, not the role.** `tab-group-state.ts`, `terminal-orphan-cleanup.ts` — not `tabs-helpers.ts`, `terminal-utils.ts`. Reaching for `helpers` means the file has more than one responsibility, or a better name is hiding in what the code operates on.
- **Don't repeat the folder.** In `source-control/` the file is `panel.tsx`, not `source-control-panel.tsx`. Prefix-stuttering makes every listing unscannable.
- **Short and concrete** — two or three words. If you need five, it's doing five things.
- **Domain over mechanism:** `resolveWorktreeBaseRef`, not `processData`. Booleans read as assertions (`isGitBashAvailable`, `hasUncommittedChanges`). Don't encode the type in the name (`worktreeList`, not `worktreeArray`) or abbreviate past recognition (`repo` is established here; `wt` isn't).
- `PascalCase` types and components, `camelCase` values, `SCREAMING_SNAKE` module constants with a unit suffix where there is one (`KEYBOARD_INPUT_SOURCE_TIMEOUT_MS`). Props types are `<Component>Props`.
- Keep meaningful role suffixes (`.config.ts`). Exempt: tool-discovery names, generated artifacts, native-language conventions.

---

## 3. Cohesion: keep logic where it is used

Splitting is good; scattering is not. The difference is whether the pieces stay together.

- **Colocate first.** A helper used by one component lives in that component's file until it has a second caller. A separate file per function is how you get 400 loose modules and a feature nobody can read.
- **Split along seams, not line counts.** Extract when a unit has its own reason to change — a parser, a protocol frame, a capability probe, a pure reducer. Don't extract because a file got long; restructure so it doesn't need to be.
- **Hard limits** (counted lines, blanks and comments excluded): 300 `.ts`, 400 `.tsx`, 600 `.mjs`. Hitting one means more than one responsibility. Split within the feature folder, never into a shared dump, and never suppress the rule.
- **Push logic out of components.** A component decides layout and wiring; branching rules, parsing, and normalization go to a pure sibling module in the same folder.
- **State lives at one altitude.** Store slice, feature module, or component — one owner writes, the rest read. Section 5 has the ladder that picks the altitude.

**When to extract a function** — colocate-first and push-logic-out meet here; work down and stop at the first match:

1. It is a decision — branching, parsing, normalization, validation → a pure sibling module in the feature folder, even with one caller. Pure functions with narrow types are this repo's testability substitute: the type system verifies what an effect braid hides.
2. It gains a second caller inside the feature → hoist to a feature-folder file named for what it operates on.
3. A second, unrelated feature needs it → one level up, named for the domain (`capability-cache.ts`), never for a role.
4. Otherwise it stays inline. A private helper above its single caller is healthy; a one-function file is scattering.

---

## 4. TypeScript: client, extension, gateway, and scripts

`strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, and `erasableSyntaxOnly` are all on.

- No parameter properties; model closed sets as a union of string literals plus a plain object.
- Use `unknown` at boundaries and narrow. Rest args are the only `any` exemption.
- `import type { … }` for type-only imports.
- `switch` over a union is exhaustive with no `default` — adding a union member should break every switch that handles it.
- Type declarations go in `.ts`. A generated platform binding such as Wrangler's
  `worker-configuration.d.ts` is the only exception. `skipLibCheck: true` can silently widen
  unresolved names in a hand-written `.d.ts` to `any`.
- Prefer `satisfies` over `as`. An `as` cast is a claim the type system can't back — if you need one, say why.
- **Imports use an alias the moment they leave the folder they belong to.** `~renderer/*` means
  `packages/client/src/*`; it is package-internal and supplied to hosts by the
  `@agentstart/client/vite` preset. Inside an app or package, `./x` and `../x` stay relative — reach for
  the package's alias at two levels up or more. Protocol and model packages use relative imports
  internally so they never depend on a host resolver.
- Extension source cannot use `~renderer`; it consumes public `@agentstart/client` exports. Client source
  cannot import app source. These are architectural rules, not style preferences; review currently
  enforces them.

---

## 4a. Rust: the daemon

One crate, `agentstart-daemon`, edition 2024, toolchain 1.95, `unsafe_code = "forbid"`. Sections 1–3 apply
unchanged: a feature is a folder, named for the thing, and you should find it from the feature name
in one guess. `snake_case` files and folders is the only naming difference.

- **A module is a feature.** `src/<feature>/` holds everything that belongs only to it. Its root is
  the sibling `<feature>.rs` next to the folder — the style throughout `src/rpc/` — or
  `<feature>/mod.rs`. Match whichever the neighbours use; don't introduce a third shape.
- **A capability is one handler.** `src/rpc/<feature>.rs` plus its `src/rpc/<feature>/` folder, named
  for the same feature as its `packages/protocol/proto/agent_start/<feature>/` schema. Handlers use the
  generated typed method descriptors; transport, authentication, authorization, deadlines, and
  resource limits are already enforced before a handler runs — never re-implement or bypass them.
- **Errors are owned, typed, and matchable.** A `thiserror`-derived enum per feature, returned in
  `Result`. `anyhow` is deliberately not a dependency: a caller across the protocol boundary has to
  be able to match on the failure, not read a string.
- **No panics on a request path.** `.unwrap()` and `panic!` appear nowhere in the crate and must stay
  that way. `.expect("…")` is only for a genuine start-up invariant, and its message names the
  invariant. `unreachable!` is allowed where the type system can't express why a branch is dead.
- **Clippy is a gate, not advice.** `cargo clippy --locked --all-targets -- -D warnings` must pass
  with zero warnings, and there are zero `#[allow(…)]` in the crate. Fix the code.
- **No `#[cfg(test)]`, no `cargo test` target, no dev-dependencies.** Section 9 applies to Rust too.
- **Cohesion over a line count.** Section 3's `.ts`/`.tsx` caps have no Rust equivalent, so the seam
  rule is all you get: split when a unit has its own reason to change — an authority, a transport
  frame, a parser, a persistence migration. 75 modules already run past 500 lines; those are seams
  nobody has found yet, not a licence to add more.
- **Dependencies are pinned and trimmed.** Exact versions in `Cargo.toml`, `default-features = false`
  with an explicit feature list wherever the default pulls in what the daemon does not use.
- Build paths with `Path`/`PathBuf` joins, never string concatenation, and route host-scoped effects
  through `src/hosts/` (Section 7).

---

## 5. React and the renderer

- `export function Component(props: ComponentProps): React.JSX.Element`. Named exports; a default export only where `React.lazy` requires one.
- **Never derive state in an effect.** No `useState` + `useEffect` mirroring a prop or recomputing a value — compute during render, or `useMemo` when it's genuinely expensive. The `react-doctor` pass warns on `no-derived-state-effect`, `no-adjust-state-on-prop-change`, and `no-initialize-state`; treat those as errors.
- Effects synchronize with things outside React — subscriptions, IPC listeners, timers, imperative host libraries — and every one cleans up.
- Fix `react/exhaustive-deps` warnings; don't silence them.
- No inline object or array literals as context values or memo-sensitive props.
- Store access goes through selectors, so a component re-renders only on what it reads.
- Keys are stable identities, never array indices.

### Where state lives

Work down the ladder and stop at the first level that fits. A fact lives at exactly one level — every mirror is a bug that hasn't fired yet, and syncing mirrors is how derived-state effects sneak back in.

1. **The runtime host** owns anything that must survive the window: sessions, terminals, worktrees, agent state. The renderer subscribes and sends commands; it never keeps an authoritative copy. Test: if closing the window must not lose it, it is host state.
2. **The URL** owns location — which project, worktree, and panel is on screen. Test: if back/forward or reopening the page should restore it, it is URL state, not store state.
3. **The zustand store** owns UI state shared across unrelated components or outliving a mount: selection, layout, optimistic pending writes. A slice lives in the feature folder that writes it; reads go through selectors.
4. **`useState`** owns single-component interaction state: drafts, open/hover/focus flags. When a second component needs it, it moves up the ladder — not sideways through prop threading or a context invented for the pair.
5. **Derived values are stored nowhere.** Compute in render, `useMemo` when genuinely expensive, or derive in a selector.

---

## 6. Formatting and comments

Formatting is not a decision. `vp fmt` owns every TypeScript, JSON, and CSS file: single quotes, no
semicolons, 100 columns, no trailing commas, sorted imports, sorted Tailwind classes. `cargo fmt`
owns the daemon. Markdown and the generated protobuf bindings are deliberately excluded from both.
Don't hand-format around any of it.

**Comments explain why, never what.** A comment exists only when the reason isn't recoverable from the code — a safety constraint, a platform quirk, a compatibility shim, a deliberate rule. One or two lines; capture the reason and stop. Don't restate the mechanism, narrate control flow, or quote a document.

The house convention is the `Why:` prefix, which makes the load-bearing comments greppable — there are ~15,000 and they are this codebase's real documentation.

No `TODO` without an issue link. No commented-out code — git has it.

---

## 7. Hosts and platforms: never assume local

Work runs on the local machine, in a WSL distro, and over SSH. Every path that touches a filesystem,
a process, or a git binary must work on all of them, on macOS, Linux, and Windows alike — code,
commands, and scripts.

- Resolve paths with `Path`/`PathBuf` joins in the daemon, `path.join` in Node-side tooling, and the
  selected host's own path methods in host-scoped effects. Never assume `/` or `\`.
- Route filesystem, git, terminal, and search operations through authenticated daemon capabilities
  and `apps/daemon/src/hosts/`; browser features never touch a process or a filesystem directly.
- Scope cached host state — capabilities, versions, connection health — to the host that executes it. One host's answer must never leak into another's.
- Keyboard shortcuts branch on platform: `navigator.userAgent.includes('Mac')` → `metaKey`, else `ctrlKey`.

---

## 8. Git

AgentStart shells out to **the user's** git binary, whose version differs across native, WSL, and SSH hosts. **Git 2.25** is the core-workflow baseline.

- Check when every subcommand and option was introduced. Newer behavior needs a baseline-compatible fallback, or must degrade safely.
- A newer preferred/fallback pair owns a host-scoped capability cache and a narrow
  unsupported-error predicate, so a known-invalid command is not retried on every poll. `git
  --version` is not sufficient.
- Preserve global options that precede the subcommand (`git -c …`), including auto-maintenance suppression on worktree-create fetches.
- Adopting a newer feature means exercising preferred and fallback paths against the relevant real
  git binaries during the task. Any temporary verification harness must be removed before finish.

GitHub is the only hosted-review provider. Git repositories from every host still work through the
generic Git capabilities, but do not add provider-specific APIs for GitLab, Bitbucket, Gitea, or
Azure DevOps. The user's `gh` rate limit is a shared resource — batch requests and skip calls you
don't need.

---

## 9. No tests

**Do not write or retain tests, smoke checks, or E2E harnesses.**

Delete existing unit, integration, snapshot, smoke, and end-to-end tests instead of repairing,
updating, or expanding them. The repository must contain no test files, test suites,
validation-only scripts, package commands, or CI jobs. If an unusual task truly needs an automated
exercise, keep it temporary and delete it immediately after use. Verify retained code through
builds, typechecking, linting, repository-contract checks, and running the app.

---

## 10. Verify before you finish

`pnpm check` is the gate, and it spans both languages: `cargo fmt` on the daemon, repository
lint/format fixes, the workspace typecheck graph, then `cargo fmt --check` plus zero-warning clippy.
`pnpm typecheck`, `pnpm lint`, and `pnpm fmt` run the TypeScript pieces individually; `vp run
@agentstart/daemon#lint` runs the Rust gate alone. CI additionally builds the daemon on Linux, macOS, and
Windows, so a change that only compiles on your platform fails there.

The design-token budget, UI style drift, source-path references, and localization coverage rules
have no automated check; they still apply and require review.

**Reach into a package with `vp run <package>#<task>`**, from anywhere in the repo — `vp run
@agentstart/daemon#build`, `vp run @agentstart/extension#build`, `vp run agentstart-mobile#dev`. The root
`package.json` holds only what the whole workspace shares. Inside a package, one script calls another
with `vp run <task>`, never `pnpm run <task>`, so the task graph stays visible to the runner.

A script that needs its workspace dependencies built first says so itself, with `vp run --filter '{.}^...' build` — the filter resolves this package's own dependencies from the workspace graph, so no caller has to remember the order and no package list gets hardcoded. Keep such work in `package.json`: a task defined in `vite.config.ts` is unreachable from `pnpm run`, which strands every call site that isn't already inside Vite+.

That graph is built from `workspace:*` dependencies only. A workspace package pulled in through `catalog:` is invisible to it — the filter silently selects nothing and the ordering disappears — so cross-package deps here are always declared `workspace:*`.

Report results honestly: if something fails, show the output; if you skipped a step, say which.

---

## 11. Working in legacy areas

Some retained protocol models, mobile screens, and client primitives predate these rules. Flat
feature folders, stuttering filenames, and feature CSS in `packages/client/src/assets/main.css` are
states to move away from, not precedents to copy.

- **New code follows this document**, without exception.
- **When you touch a legacy area, move what you touch toward it**: pull the files you're already editing into the feature folder, drop the redundant prefixes.
- **A low-quality file you're working in may be refactored outright.** If a file or module you're already changing clearly violates this document — role-named dump, smeared state, effect-derived state, unreadable control flow — rewriting it to standard is in scope, not an unrequested refactor. Keep the blast radius to the files the task already touches plus their immediate callers, and say in the PR what was rewritten and why.
- Never resolve a conflict between this document and surrounding code by matching the surrounding code.

---

## 12. Environment

Always read and edit through the primary working directory — this worktree. Never follow an absolute path from a subagent's result into the main repo; edits there are invisible here.
