import { acquireCdp, releaseCdp, sendCdp } from '../cdp/session'
import type { BrowserAnnotationViewportInput } from './control-input'

const annotationOperations = new Map<number, Promise<boolean>>()

export async function setPageAnnotationViewport(
  tabId: number,
  input: BrowserAnnotationViewportInput,
  isCurrent: () => boolean
): Promise<{ accepted: boolean }> {
  return {
    accepted: await enqueueAnnotation(tabId, () => applyAnnotation(tabId, input, isCurrent))
  }
}

export async function releasePageAnnotationViewport(tabId: number): Promise<void> {
  if (!(await enqueueAnnotation(tabId, () => clearAnnotation(tabId)))) {
    throw new Error('browser_annotation_cleanup_failed')
  }
}

async function applyAnnotation(
  tabId: number,
  input: BrowserAnnotationViewportInput,
  isCurrent: () => boolean
): Promise<boolean> {
  let acquired = false
  try {
    await acquireCdp(tabId, 'browser-annotation')
    acquired = true
    if (!isCurrent()) {
      return false
    }
    const frameTree = await sendCdp(tabId, 'Page.getFrameTree')
    const frameId = readMainFrameId(frameTree)
    if (!frameId || !isCurrent()) {
      return false
    }
    const contextId = await annotationContext(tabId, frameId)
    if (contextId === null || !isCurrent()) {
      return false
    }
    const response = await sendCdp(tabId, 'Runtime.evaluate', {
      awaitPromise: true,
      contextId,
      expression: annotationViewportScript(input),
      returnByValue: true
    })
    if (!isCurrent()) {
      await evaluateCleanup(tabId, contextId)
      return false
    }
    return !readObject(response, 'exceptionDetails')
  } catch {
    return false
  } finally {
    if (acquired) {
      await releaseCdp(tabId, 'browser-annotation')
    }
  }
}

async function clearAnnotation(tabId: number): Promise<boolean> {
  let acquired = false
  try {
    await acquireCdp(tabId, 'browser-annotation')
    acquired = true
    const frameTree = await sendCdp(tabId, 'Page.getFrameTree')
    const frameId = readMainFrameId(frameTree)
    if (!frameId) {
      return false
    }
    const contextId = await annotationContext(tabId, frameId)
    return contextId === null ? false : await evaluateCleanup(tabId, contextId)
  } catch {
    return false
  } finally {
    if (acquired) {
      await releaseCdp(tabId, 'browser-annotation')
    }
  }
}

async function annotationContext(tabId: number, frameId: string): Promise<number | null> {
  const world = await sendCdp(tabId, 'Page.createIsolatedWorld', {
    frameId,
    grantUniveralAccess: false,
    worldName: 'agentstart-annotation-viewport'
  })
  return readNumber(world, 'executionContextId')
}

async function evaluateCleanup(tabId: number, contextId: number): Promise<boolean> {
  const response = await sendCdp(tabId, 'Runtime.evaluate', {
    awaitPromise: true,
    contextId,
    expression: ANNOTATION_CLEANUP_SCRIPT,
    returnByValue: true
  })
  return !readObject(response, 'exceptionDetails')
}

async function enqueueAnnotation(
  tabId: number,
  operation: () => Promise<boolean>
): Promise<boolean> {
  const previous = annotationOperations.get(tabId) ?? Promise.resolve(true)
  const current = previous.catch(() => false).then(operation)
  annotationOperations.set(tabId, current)
  try {
    return await current
  } finally {
    if (annotationOperations.get(tabId) === current) {
      annotationOperations.delete(tabId)
    }
  }
}

function readMainFrameId(value: unknown): string | null {
  const frameTree = readObject(value, 'frameTree')
  const frame = frameTree ? readObject(frameTree, 'frame') : null
  const id = frame ? Reflect.get(frame, 'id') : null
  return typeof id === 'string' ? id : null
}

function readNumber(value: unknown, key: string): number | null {
  const candidate = typeof value === 'object' && value !== null ? Reflect.get(value, key) : null
  return typeof candidate === 'number' ? candidate : null
}

function readObject(value: unknown, key: string): object | null {
  const candidate = typeof value === 'object' && value !== null ? Reflect.get(value, key) : null
  return typeof candidate === 'object' && candidate !== null ? candidate : null
}

function annotationViewportScript(input: BrowserAnnotationViewportInput): string {
  return `(() => {
    const enabled = ${JSON.stringify(input.enabled)};
    const emitViewport = ${JSON.stringify(input.emitViewport)};
    const markers = ${JSON.stringify(input.markers)};
    const token = ${JSON.stringify(input.token)};
    const key = '__agentstartBrowserAnnotationViewportBridge';
    const old = globalThis[key];
    const cleanup = (state) => {
      if (!state) return;
      if (state.frame) cancelAnimationFrame(state.frame);
      window.removeEventListener('scroll', state.update, true);
      document.removeEventListener('scroll', state.update, true);
      window.removeEventListener('resize', state.update, true);
      if (state.host) state.host.remove();
    };
    if (!enabled) {
      cleanup(old);
      delete globalThis[key];
      return true;
    }
    cleanup(old);
    const host = document.createElement('div');
    host.setAttribute('data-agentstart-browser-annotation-overlay', '');
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;overflow:hidden;';
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = '.m{position:absolute;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:9999px;border:1px solid #fff;background:#2563eb;color:#fff;font:600 11px/1 sans-serif;box-shadow:0 10px 24px rgba(0,0,0,.18)}';
    root.appendChild(style);
    const elements = markers.map((marker) => {
      const element = document.createElement('span');
      element.className = 'm';
      element.textContent = String(marker.index + 1);
      root.appendChild(element);
      return element;
    });
    (document.body || document.documentElement).appendChild(host);
    const state = { frame: 0, host, update: null };
    const render = () => {
      state.frame = 0;
      markers.forEach((marker, index) => {
        const rect = marker.isFixed ? marker.rectViewport : marker.rectPage;
        const x = marker.isFixed ? rect.x : rect.x - window.scrollX;
        const y = marker.isFixed ? rect.y : rect.y - window.scrollY;
        const visible = x + rect.width >= 0 && y + rect.height >= 0 && x <= innerWidth && y <= innerHeight;
        elements[index].style.display = visible ? 'flex' : 'none';
        elements[index].style.transform = 'translate3d(' + (x + rect.width / 2 - 12) + 'px,' + (y + rect.height - 12) + 'px,0)';
      });
      if (emitViewport) console.debug('__agentstart_annotation_viewport__:' + token + ':' + JSON.stringify({ scrollX: window.scrollX, scrollY: window.scrollY }));
    };
    state.update = () => {
      if (!state.frame) state.frame = requestAnimationFrame(render);
    };
    window.addEventListener('scroll', state.update, true);
    document.addEventListener('scroll', state.update, true);
    window.addEventListener('resize', state.update, true);
    globalThis[key] = state;
    state.update();
    return true;
  })()`
}

const ANNOTATION_CLEANUP_SCRIPT = `(() => {
  const key = '__agentstartBrowserAnnotationViewportBridge';
  const state = globalThis[key];
  if (!state) return true;
  if (state.frame) cancelAnimationFrame(state.frame);
  window.removeEventListener('scroll', state.update, true);
  document.removeEventListener('scroll', state.update, true);
  window.removeEventListener('resize', state.update, true);
  if (state.host) state.host.remove();
  delete globalThis[key];
  return true;
})()`
