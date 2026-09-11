# Browser style guide

This is the visual contract for the Chrome workbench in `packages/client/src`. Architecture,
module boundaries, localization, and component rules remain owned by [`AGENTS.md`](../AGENTS.md).
The native iOS client has a separate contract in
[`apps/mobile/DESIGN.md`](../apps/mobile/DESIGN.md).

| Source | Ownership |
| --- | --- |
| `packages/client/src/assets/main.css` | Global tokens and document base styles |
| `packages/client/src/ui/` | Browser UI primitives |
| `packages/client/src/icons/hugeicons.tsx` | Semantic icon adapter |
| Feature folder | Layout, product state, and feature-owned composition |

## Design intent

AgentStart frames terminals, source control, browser evidence, and agent sessions. Its chrome stays quiet
so product state and user work carry the visual emphasis.

1. **Monochrome chrome.** Neutral colors carry navigation and controls. Color communicates a domain
   state such as success, warning, destructive action, git status, or diff meaning.
2. **Natural geometry.** Keep component-appropriate corners: controls and floating surfaces may
   use the existing radius scale, while edge-to-edge work panes retain their straight edges.
   Preserve each component's intended shape; avoid blanket radius resets or rounding sweeps.
   Use opaque backgrounds and one-pixel borders. Do not add shadows, decorative gradients, blur,
   or alpha-wash backgrounds.
3. **Dense but legible.** Body copy is 14px; compact navigation and metadata use 12px. Preserve clear
   spacing around the primary action instead of enlarging every control.
4. **Stable interaction.** Hover, focus, loading, and selected states must not resize or move the
   control. Keyboard focus remains visible.

## Tokens

`main.css` exposes the browser vocabulary:

- surfaces: `background`, `card`, `popover`, and `sidebar`, with their foreground pairs;
- actions: `primary`, `secondary`, `accent`, and `destructive`;
- state: `info`, `success`, `warning`, and `danger` for product status feedback;
- structure: `border`, `input`, `ring`, `muted`, and `muted-foreground`.

Do not add another variable to `@theme inline`. Use the existing semantic role first, then a
Tailwind palette color when the value communicates a real domain state. Feature TSX never hardcodes
hex values or recreates light/dark token pairs.

| Role | Use |
| --- | --- |
| `background` | Page canvas and default controls |
| `card` | Inline panels that need a distinct surface |
| `popover` | Command and floating primitive surfaces |
| `sidebar` | Side-panel navigation chrome |
| `primary` | The affirmative action in a flow |
| `accent` | Hover and selected rows |
| `muted-foreground` | Supporting text and disabled detail |
| `destructive` | Irreversible actions and failures |
| `border` / `ring` | Separation and keyboard focus |

Global CSS contains only imports, theme values, and document-wide base rules. Feature-specific
layout, animation, pseudo-elements, and host-library styling stay in the feature folder that owns
them.

## Typography and geometry

The document body owns the system UI font stack and 14px base size. Components inherit it; never
hardcode a platform font.

- 14px (`text-sm`): body, form values, default controls.
- 12px (`text-xs`): compact rows, captions, badges, and secondary details.
- Larger text: page and section headings only; keep the hierarchy shallow.
- Monospace: paths, code, terminal-adjacent values, and identifiers where alignment matters.

Use borders and spacing for hierarchy. A panel inside another panel normally needs a divider or
spacing, not another card treatment. Controls that may swap labels or icons reserve their final
footprint so asynchronous state never shifts adjacent content.

## Primitives

Feature code imports primitives through `~renderer/ui/<name>`. It never uses native
`button`, `input`, `textarea`, or `select` elements directly. When a missing browser control is
needed by multiple features, add a focused primitive in `ui/` before using it.

### Button

`Button` owns its paint, typography, focus state, disabled state, icon sizing, and hit geometry.
Feature `className` values may control placement and flex behavior but must not restyle the variant
or size.

| Variant | Use |
| --- | --- |
| `default` | Affirmative action |
| `outline` | Standalone or toolbar action needing a visible boundary |
| `ghost` | Row, navigation, and icon action that should recede |

| Size | Use |
| --- | --- |
| `default` / `sm` / `xs` | Text controls at decreasing density |
| `icon-sm` / `icon-xs` | Icon-only controls |
| `sidebar-row` | Full-width side-panel navigation row |

### Form controls

Use `Input` for one-line values and `Textarea` for multi-line values. Labels, descriptions, errors,
and save behavior belong to the feature; the primitive owns the border, focus, disabled state, and
base typography. Use `aria-invalid` and explicit localized error text instead of inventing another
error surface.

### Command palette

Use the exported `CommandDialog`, `CommandInput`, `CommandList`, `CommandGroup`, `CommandItem`, and
`CommandEmpty` parts. The primitive owns dialog semantics, focus handling, keyboard selection, and
the modal backdrop. Feature code supplies groups, actions, icons, and localized copy.

## Icons and copy

Browser UI icons come through `~renderer/icons/hugeicons`. Use the semantic exported
name rather than importing Hugeicons packages directly in a feature. A normal control icon is 16px;
12px icons are reserved for dense metadata. Icon-only actions require an accessible localized
label.

Every user-visible string is wrapped in `translate()` or `t()`. Empty, loading, disconnected,
permission-denied, unsupported, and failed states remain distinct when they require different user
actions.

## Surface checks

For a visual change, manually inspect the affected Chrome surface at its narrow and normal widths,
in light and dark mode. Verify keyboard navigation, visible focus, long localized copy, loading and
error states, optional-permission denial, and reconnect behavior. Browser-owned transient state may
reset after an extension reload; daemon-owned sessions and terminals must reconnect from host truth.
