export type AgentOverlayOwner = 'network-mock' | 'performance-audit' | 'recorder'

const ownersByTab = new Map<number, Set<AgentOverlayOwner>>()

export async function acquireAgentOverlay(tabId: number, owner: AgentOverlayOwner): Promise<void> {
  const owners = ownersByTab.get(tabId) ?? new Set<AgentOverlayOwner>()
  const needsRender = owners.size === 0
  owners.add(owner)
  ownersByTab.set(tabId, owners)
  if (!needsRender) {
    return
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: renderAgentOverlay
    })
  } catch (error) {
    owners.delete(owner)
    if (owners.size === 0) {
      ownersByTab.delete(tabId)
    }
    throw error
  }
}

export async function releaseAgentOverlay(tabId: number, owner: AgentOverlayOwner): Promise<void> {
  const owners = ownersByTab.get(tabId)
  owners?.delete(owner)
  if (owners && owners.size > 0) {
    return
  }
  ownersByTab.delete(tabId)
  await removeAgentOverlay(tabId)
}

export async function clearAgentOverlay(tabId: number): Promise<void> {
  ownersByTab.delete(tabId)
  await removeAgentOverlay(tabId)
}

async function removeAgentOverlay(tabId: number): Promise<void> {
  await chrome.scripting
    .executeScript({
      target: { tabId },
      func: () => document.getElementById('agentstart-agent-overlay')?.remove()
    })
    .catch(() => {})
}

function renderAgentOverlay(): void {
  if (document.getElementById('agentstart-agent-overlay')) {
    return
  }
  const overlay = document.createElement('div')
  overlay.id = 'agentstart-agent-overlay'
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;border:3px solid #7c3aed;pointer-events:none;box-sizing:border-box'
  const controls = document.createElement('div')
  controls.style.cssText =
    'position:absolute;top:12px;right:12px;display:flex;align-items:center;gap:10px;padding:8px 10px;background:#18181b;color:white;font:600 12px system-ui;box-shadow:0 8px 24px rgba(0,0,0,.24);pointer-events:auto'
  const label = document.createElement('span')
  label.textContent = chrome.i18n.getMessage('agentActive') || 'AgentStart agent is operating'
  const takeOver = document.createElement('button')
  takeOver.type = 'button'
  takeOver.textContent = chrome.i18n.getMessage('takeOver') || 'Take over'
  takeOver.style.cssText =
    'border:1px solid #a78bfa;background:#7c3aed;color:white;padding:5px 8px;font:inherit;cursor:pointer'
  takeOver.addEventListener('click', () => {
    void chrome.runtime.sendMessage({ type: 'agent-overlay-takeover' })
  })
  controls.append(label, takeOver)
  overlay.append(controls)
  document.documentElement.append(overlay)
}
