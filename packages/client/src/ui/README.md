# AgentStart UI Component Library

This catalog defines what belongs in AgentStart's reusable UI layer and where higher-level UI should live. [`docs/style-guide.md`](../../../../docs/style-guide.md) is the binding browser visual contract.

**First principle (from the style guide):** screens must reuse these primitives before writing native controls or hand-rolled class recipes. If a primitive is close but missing a size or variant, extend the primitive here — do not copy its styles into call sites.

## Layers

| Layer | Location | Owns | Must not own |
| --- | --- | --- | --- |
| Theme | `src/assets/main.css` | shadcn roles, light/dark values, exceptional product-domain CSS variables | Per-feature colors or component-specific tokens |
| Primitives | `src/ui/` | Generic appearance and headless interaction | Repositories, providers, worktrees, teams, or store workflows |
| Domain UI | The nearest feature folder or domain-named module under `components/` | Product terminology, domain data, composed workflows | New visual foundations that belong in a primitive |
| Screens | Feature folders in `src/` | Layout, data loading, copy, orchestration | Reimplementations of primitive interaction behavior; restyling primitives via color/size className overrides |

A primitive should remain useful if AgentStart's domain types are deleted. A searchable repository picker therefore belongs under `components/repo/`, even though it composes `Popover` and `Command` from the primitive layer.

Decision order for new UI: reuse a primitive → extend that primitive's CVA → domain composite → colocated host CSS. Never invent a generic `helpers` / `shared-styles` dump.

## Token policy

The supported general-purpose vocabulary is the default shadcn set. Use those roles and Tailwind's built-in color palette rather than adding aliases.

- `bg-popover`, not a menu-surface token.
- `border-border`, not a floating-border token.
- `text-green-700 dark:text-green-300`, not a success token.
- `border-border` plus an opaque surface, not an elevation variable.

Custom variables are reserved for stable product-domain semantics such as git decorations and embedded editor surfaces. CSS-only variables stay outside `@theme inline`. Nothing in CI catches a promoted exception, a reintroduced native form/action tag, a black/white alpha wash, or a private style-module import from feature code: these rules are review-enforced. See `docs/style-guide.md`.

## Primitive catalog

Import primitives directly from their module (`~renderer/ui/button`), not through a barrel.

### Actions and selection

| Module | Public interface | Notes |
| --- | --- | --- |
| `button.tsx` | `Button`, `buttonVariants` | Canonical action hierarchy and sizes (`quiet` for muted toolbar icons; `outline-transparent` for bordered titlebar chrome; `list-row` for multi-line actions) |
| `button-group.tsx` | `ButtonGroup`, `ButtonGroupText`, `ButtonGroupSeparator` | Visually joins related controls |
| `toggle.tsx` | `Toggle`, `toggleVariants` | One pressed/unpressed action |
| `toggle-group.tsx` | `ToggleGroup`, `ToggleGroupItem` | Related toggle choices |

### Forms

| Module | Public interface | Notes |
| --- | --- | --- |
| `input.tsx` | `Input` | `default` / `lg` / `sm` / `xs` / `inline-edit` sizes; `chrome-free` for host-owned editor chrome; `color` for native color swatches; `subtle` for tinted fields |
| `textarea.tsx` | `Textarea` | `default` / `sm` sizes; `chrome-free` for host-owned form chrome; `editor` for editor-surface text |
| `label.tsx` | `Label` | Accessible field label |
| `checkbox.tsx` | `Checkbox` | Independent boolean choice |
| `switch.tsx` | `Switch` | Immediate on/off setting |
| `select.tsx` | `Select` family | Single choice from a known list |
| `slider.tsx` | `Slider` | Bounded numeric choice |

### Layout, disclosure, and navigation

| Module | Public interface | Notes |
| --- | --- | --- |
| `card.tsx` | `Card` family | Repeated or framed content only |
| `separator.tsx` | `Separator` | Semantic visual divider; `size="sm"` shortens vertical toolbar splits |
| `tabs.tsx` | `Tabs` family | Peer views sharing one region |
| `accordion.tsx` | `Accordion` family | Multiple disclosure sections |
| `collapsible.tsx` | `Collapsible` family | One disclosure section |
| `scroll-area.tsx` | `ScrollArea`, `ScrollBar` | Headless custom scrolling; prefer native overflow plus documented scrollbar classes when sufficient |

### Feedback and status

| Module | Public interface | Notes |
| --- | --- | --- |
| `badge.tsx` | `Badge`, `badgeVariants` | Compact persistent metadata (`size="xs"`, `success` / `warning` tones) |
| `progress.tsx` | `Progress` | Determinate progress; `xs` size and muted/urgency tones support dense meters |
| `sonner.tsx` | `Toaster` | App-level transient notifications |

### Floating interaction

| Module | Public interface | Use for |
| --- | --- | --- |
| `tooltip.tsx` | `Tooltip` family | Non-interactive labels for compact controls |
| `hover-card.tsx` | `HoverCard` family | Rich hover previews |
| `popover.tsx` | `Popover` family | Click-revealed arbitrary content |
| `dropdown-menu.tsx` | `DropdownMenu` family | Click-revealed action menus |
| `context-menu.tsx` | `ContextMenu` family | Pointer context actions |
| `dialog.tsx` | `Dialog` family | Blocking decisions and short modal forms |
| `command.tsx` | `Command` family | Searchable actions and large option sets |

`floating-surface-styles.ts`, `menu-item-styles.ts`, and `popover-content-ref.ts` are private implementation modules shared by these wrappers. Screens should import rendered primitives, not those modules.

## Current domain composites

These are examples to copy when the same domain needs another composed picker; they are not primitives:

- `components/repo/repo-multi-combobox.tsx`
- `components/repo/repo-color-picker.tsx`
- `components/settings/settings-form-controls.tsx`

## Adding or changing UI

1. Start with the nearest existing primitive; prefer `variant` / `size` over call-site color or height overrides.
2. If the same call-site exception would repeat, add a CVA axis here instead of copying classes.
3. Compose default shadcn roles; do not add a theme token for the task.
4. Put domain imports and copy outside `ui/`.
5. Preserve `data-slot` on primitive parts and merge caller `className` last with `cn()` (layout only at call sites).
6. Use Base UI for headless behavior, Hugeicons free icons for icons, and existing scrollbar classes.
7. Screens import rendered modules only — never `floating-surface-styles.ts` or `menu-item-styles.ts`.
8. Check light/dark, keyboard focus, reduced motion, Windows/Linux labels, and remote latency.
9. Update this catalog only when the reusable interface or ownership changes.
