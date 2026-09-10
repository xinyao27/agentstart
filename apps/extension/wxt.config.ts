import { createClientVitePreset } from '@agentstart/client/vite'
import { createLogger, type Plugin } from 'vite'
import { defineConfig } from 'wxt'

const EXTENSION_ORIGIN = 'chrome-extension://mfgmfiabfncmdekmikepemddejoeihbf'

const extensionDevOriginPlugin: Plugin = {
  name: 'agentstart-extension-dev-origin',
  configureServer(server) {
    server.middlewares.use((_request, response, next) => {
      response.setHeader('Access-Control-Allow-Origin', EXTENSION_ORIGIN)
      next()
    })
  }
}

const viteLogger = createLogger()
const reportViteError = viteLogger.error
viteLogger.error = (message, options) => {
  // Why: Chromium reports this self-resolving layout notification through window.onerror.
  // Keep every actionable Vite error while removing this one standard browser diagnostic.
  if (message.includes('ResizeObserver loop completed with undelivered notifications')) {
    return
  }
  reportViteError(message, options)
}

export default defineConfig({
  dev: {
    server: {
      host: '127.0.0.1',
      origin: 'http://127.0.0.1:3100',
      port: 3100,
      strictPort: true
    }
  },
  hooks: {
    'config:resolved': (wxt) => {
      // Why: WXT 0.21 still installs its unimport transform when `imports` is false.
      // Empty the resolved catalogs so client-local names such as `browser` and
      // `storage` are not rewritten into undeclared WXT package imports.
      wxt.config.imports.imports = []
      wxt.config.imports.presets = []
    },
    'build:manifestGenerated': (wxt, manifest) => {
      const optionalPermissions: unknown = Reflect.get(manifest, 'optional_permissions')
      if (!Array.isArray(optionalPermissions)) {
        throw new Error('wxt_optional_permissions_missing')
      }
      if (wxt.config.command === 'serve') {
        manifest.action = {
          ...manifest.action,
          default_icon: {
            16: 'icons/dev-16.png',
            32: 'icons/dev-32.png'
          }
        }
        manifest.icons = {
          16: 'icons/dev-16.png',
          32: 'icons/dev-32.png',
          48: 'icons/dev-48.png',
          128: 'icons/dev-128.png'
        }
        // Why: WXT promotes these permissions during development; Chrome must not see duplicates.
        for (const permission of ['scripting']) {
          const index = optionalPermissions.indexOf(permission)
          if (index >= 0) {
            optionalPermissions.splice(index, 1)
          }
        }
      }
    }
  },
  imports: false,
  manifest: {
    action: {
      default_icon: {
        16: 'icons/icon-16.png',
        32: 'icons/icon-32.png'
      },
      default_title: '__MSG_openSidePanel__'
    },
    commands: {
      'open-agentstart': {
        description: '__MSG_openAgentStartCommand__',
        suggested_key: { default: 'Ctrl+Shift+Y', mac: 'Command+Shift+Y' }
      }
    },
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'self'; connect-src http://127.0.0.1:* http://localhost:* https://* ws://127.0.0.1:* ws://localhost:* ws://* wss://*"
    },
    default_locale: 'en',
    description: '__MSG_appDescription__',
    host_permissions: ['http://127.0.0.1/*', 'http://[::1]/*', 'http://localhost/*'],
    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png'
    },
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu9Mn4TblyzESw2t/T/jRik7eEIdoBuSrwfPXCaA7v15bU0UBjoVR2jYercVGtNnkD1zlS2A6SvDKLGT2JwHK5Tbwoz7TLyylOE1kNCckj+Yeb9rTUFKKEC7EtvHnkeqj07TiPWZ7IA+OtCFP9FfNh9oBvpT1MfMl/2UNiPgwgsnOeZGCfc2YzThViNgCnp+12tFDfERtF9vys9xsk8CQDqfFWHI4ff9NuvMXiIubl5tl54NUHTUlqOe+KvSgAoaEpPzS0oaYcyCAg3Lrj98r7pDYza4hpg7KcmkBGzGAGyb64ZWlYeb5jsTheR95uy9ThUSo8DnS9PcBM6ZBAHGRmQIDAQAB',
    minimum_chrome_version: '120',
    name: '__MSG_appName__',
    omnibox: { keyword: 'agentstart' },
    optional_host_permissions: [
      'http://*/*',
      'http://127.0.0.1/*',
      'http://localhost/*',
      'https://*/*',
      'https://github.com/*'
    ],
    optional_permissions: [
      'activeTab',
      'bookmarks',
      'history',
      'idle',
      'notifications',
      'power',
      'scripting',
      'system.display',
      'tabCapture',
      'userScripts'
    ],
    permissions: [
      'contextMenus',
      'debugger',
      'downloads',
      'nativeMessaging',
      'sidePanel',
      'storage',
      'tabGroups',
      'tabs',
      'webNavigation'
    ],
    storage: { managed_schema: 'managed-storage-schema.json' }
  },
  manifestVersion: 3,
  publicDir: 'public',
  srcDir: 'src',
  vite: () => {
    const clientPreset = createClientVitePreset({ featureWallEnabled: false })
    return {
      ...clientPreset,
      customLogger: viteLogger,
      // Why: Chrome 151–152 rejects extension-page module preloads across isolated worlds.
      build: { modulePreload: false },
      // Why: extension pages load Vite across origins, while Vite's default CORS policy only
      // trusts localhost origins and otherwise leaves Chrome waiting on the module request.
      plugins: [...clientPreset.plugins, extensionDevOriginPlugin]
    }
  },
  webExt: { disabled: true }
})
