# `@agentstart/client`

`@agentstart/client` is AgentStart's source-only workbench UI consumed by the Chrome extension host. It
deliberately has no JavaScript distribution build:

- Hosts already bundle its TypeScript and TSX source, avoiding a second compilation boundary.
- Wildcard exports cannot describe a tree containing TSX, CSS, fonts, workers, and `?url` assets.
- Vite must see the original asset imports and stylesheet graph to preserve their URL semantics.

## Public exports

| Export | Purpose |
| --- | --- |
| `@agentstart/client/extension-bootstrap` | Chrome workbench and side-panel bootstrap |
| `@agentstart/client/extension-devtools` | Chrome DevTools panel bootstrap |
| `@agentstart/client/extension-install` | Chrome extension installation surface |
| `@agentstart/client/styles` | Global tokens and workbench chrome stylesheet |
| `@agentstart/client/vite` | Client root, aliases, React/Tailwind plugins, workers, and feature defines |

Consumers use only these exports; they never import `@agentstart/client/src/*`. The package owns its own
`fmt`, `lint`, and `typecheck` tasks; its localization catalogs in `src/i18n/locales/` are authored,
not generated, and its UI policy is review-enforced. A client implementation change should not
require an extension-host edit unless it also changes a host-facing runtime or shell contract.

## Host setup

```ts
import { createClientVitePreset } from '@agentstart/client/vite'
import { defineConfig } from 'vite'

const client = createClientVitePreset({ featureWallEnabled: true })

export default defineConfig({
  ...client,
  build: { outDir: 'out/extension' }
})
```

Hosts may extend the returned configuration for their output format, but client source resolution
and plugin ownership stay in the preset.
