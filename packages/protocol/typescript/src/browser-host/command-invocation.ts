import type { BrowserTarget, ExecuteRequest } from '../../generated/yiru/runtime/v1/browser_pb.js'

export type BrowserCommandInvocation = Readonly<{ input: unknown; method: string }>

type CommandCase = Exclude<ExecuteRequest['command']['case'], undefined>

export function invocation(command: CommandCase, input: unknown): BrowserCommandInvocation {
  return { input, method: methodName(command) }
}

export function targetInput(target: BrowserTarget | undefined): Record<string, string> {
  return {
    ...(target?.page ? { page: target.page } : {}),
    ...(target?.worktree !== undefined ? { worktree: target.worktree } : {})
  }
}

function methodName(command: CommandCase): string {
  const special: Partial<Record<CommandCase, string>> = {
    captureStart: 'capture.start',
    captureStop: 'capture.stop',
    certificateProceed: 'certificate.proceed',
    cookieDelete: 'cookie.delete',
    cookieGet: 'cookie.get',
    cookieSet: 'cookie.set',
    doubleClick: 'dblclick',
    grabAwaitSelection: 'grab.awaitSelection',
    grabCancel: 'grab.cancel',
    grabCaptureSelection: 'grab.captureSelection',
    grabExtractHover: 'grab.extractHover',
    grabSetMode: 'grab.setMode',
    insertText: 'keyboardInsertText',
    interceptDisable: 'intercept.disable',
    interceptEnable: 'intercept.enable',
    interceptList: 'intercept.list',
    pageControlOpenDevTools: 'pageControl.openDevTools',
    pageControlRegister: 'pageControl.register',
    pageControlSetActive: 'pageControl.setActive',
    pageControlSetAnnotationViewport: 'pageControl.setAnnotationViewport',
    pageControlSetViewportOverride: 'pageControl.setViewportOverride',
    pageControlUnregister: 'pageControl.unregister',
    storageLocalClear: 'storage.local.clear',
    storageLocalGet: 'storage.local.get',
    storageLocalSet: 'storage.local.set',
    storageSessionClear: 'storage.session.clear',
    storageSessionGet: 'storage.session.get',
    storageSessionSet: 'storage.session.set'
  }
  return `browser.${special[command] ?? command}`
}
