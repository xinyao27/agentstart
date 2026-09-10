# Settings invariants

## Entries

- Settings owns navigation to Appearance, Terminal, Browser, Notifications,
  Troubleshooting, About, and the DEBUG-only Design System lab. Each child route returns to the
  same Settings stack and does not create a second preference store.
- Appearance is the source for theme, loader preview/selection, and default session view. Browser
  is the source for terminal-link destination and Web/Mobile browser defaults. Chat and Terminal
  screens own their feature-specific preferences.

## Persistence and migration

- `SettingsPreferences` is the single writer for theme, loader, default session view, and terminal
  link mode. Changes are written synchronously to `UserDefaults` and are immediately reflected in
  the shared environment.
- Credential cleanup is host-scoped, retryable, and never blocks navigation through unrelated
  Settings rows. A failed cleanup remains visible until it succeeds or the user leaves the page.

## Visual contract

- Settings rows use a 44-point rhythm, 16-point horizontal inset, semantic Hugeicons,
  and the standard header glyph metrics. Default foreground colors are preferred; special colors
  are reserved for attention/success states.
- Loader previews render every available style with the Settings-selected neutral gray treatment;
  no page writes a hard-coded blue loader. Sheets use the shared fixed/page presentation policy,
  including the picker's hidden drag indicator where applicable.
- iOS 26 Liquid Glass is limited to interactive chrome. Settings content, dividers, and backgrounds
  do not receive decorative glass or gradients.
