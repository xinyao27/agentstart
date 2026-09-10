export type RenderingHostBootstrap = {
  platform: NodeJS.Platform
  osRelease: string
  displayServer: 'wayland' | 'x11' | null
}

const PLATFORM_PARAM = 'agentstart-rendering-platform'
const OS_RELEASE_PARAM = 'agentstart-rendering-os-release'
const DISPLAY_SERVER_PARAM = 'agentstart-rendering-display-server'

export function parseRenderingHostBootstrap(search: string): RenderingHostBootstrap | null {
  const params = new URLSearchParams(search)
  const platform = params.get(PLATFORM_PARAM)
  const osRelease = params.get(OS_RELEASE_PARAM)
  const displayServer = params.get(DISPLAY_SERVER_PARAM)
  if (!isDesktopPlatform(platform) || osRelease === null || !isDisplayServer(displayServer)) {
    return null
  }
  return {
    platform,
    osRelease,
    displayServer: displayServer || null
  }
}

function isDesktopPlatform(value: string | null): value is 'darwin' | 'linux' | 'win32' {
  return value === 'darwin' || value === 'linux' || value === 'win32'
}

function isDisplayServer(value: string | null): value is '' | 'wayland' | 'x11' {
  return value === '' || value === 'wayland' || value === 'x11'
}
