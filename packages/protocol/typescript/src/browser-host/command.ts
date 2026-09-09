import type { ExecuteRequest } from '../../generated/yiru/runtime/v1/browser_pb.js'
import { invocation, targetInput } from './command-invocation.js'
import type { BrowserCommandInvocation } from './command-invocation.js'
import { decodePageControlCommand } from './command-page-control.js'
import { decodeSessionCommand } from './command-session.js'

export type { BrowserCommandInvocation } from './command-invocation.js'

export function decodeBrowserCommand(request: ExecuteRequest): BrowserCommandInvocation {
  const command = request.command
  switch (command.case) {
    case 'snapshot':
    case 'back':
    case 'reload':
    case 'forward':
    case 'pdf':
    case 'clipboardRead':
    case 'dialogDismiss':
    case 'interceptDisable':
    case 'interceptList':
    case 'captureStart':
    case 'captureStop':
    case 'storageLocalClear':
    case 'storageSessionClear':
      return invocation(command.case, targetInput(command.value.target))
    case 'screenshot':
    case 'fullScreenshot':
      return invocation(command.case, {
        format: command.value.format || undefined,
        ...targetInput(command.value.target)
      })
    case 'goto':
      return invocation(command.case, {
        url: command.value.url,
        ...targetInput(command.value.target)
      })
    case 'eval':
      return invocation(command.case, {
        expression: command.value.expression,
        ...targetInput(command.value.target)
      })
    case 'scroll':
      return invocation(command.case, {
        amount: command.value.amount,
        direction: command.value.direction,
        ...targetInput(command.value.target)
      })
    case 'wait':
      return invocation(command.case, {
        fn: command.value.function,
        load: command.value.load,
        selector: command.value.selector,
        state: command.value.state,
        text: command.value.text,
        timeout: command.value.timeout,
        url: command.value.url,
        ...targetInput(command.value.target)
      })
    case 'click':
    case 'doubleClick':
    case 'focus':
    case 'clear':
    case 'selectAll':
    case 'hover':
    case 'scrollIntoView':
      return invocation(command.case, {
        element: command.value.element,
        ...targetInput(command.value.target)
      })
    case 'fill':
    case 'select':
      return invocation(command.case, {
        element: command.value.element,
        value: command.value.value,
        ...targetInput(command.value.target)
      })
    case 'type':
      return invocation(command.case, {
        input: command.value.input,
        ...targetInput(command.value.target)
      })
    case 'check':
      return invocation(command.case, {
        checked: command.value.checked,
        element: command.value.element,
        ...targetInput(command.value.target)
      })
    case 'keypress':
      return invocation(command.case, {
        key: command.value.key,
        ...targetInput(command.value.target)
      })
    case 'drag':
      return invocation(command.case, {
        from: command.value.from,
        to: command.value.to,
        ...targetInput(command.value.target)
      })
    case 'upload':
      return invocation(command.case, {
        element: command.value.element,
        files: command.value.files,
        ...targetInput(command.value.target)
      })
    case 'get':
      return invocation(command.case, {
        selector: command.value.selector,
        what: command.value.what,
        ...targetInput(command.value.target)
      })
    case 'is':
      return invocation(command.case, {
        selector: command.value.selector,
        what: command.value.what,
        ...targetInput(command.value.target)
      })
    case 'insertText':
    case 'clipboardWrite':
      return invocation(command.case, {
        text: command.value.text,
        ...targetInput(command.value.target)
      })
    case 'dialogAccept':
      return invocation(command.case, {
        text: command.value.text,
        ...targetInput(command.value.target)
      })
    case 'find':
      return invocation(command.case, {
        action: command.value.action,
        locator: command.value.locator,
        text: command.value.text,
        value: command.value.value,
        ...targetInput(command.value.target)
      })
    case 'highlight':
      return invocation(command.case, {
        selector: command.value.selector,
        ...targetInput(command.value.target)
      })
    case 'mouseMove':
      return invocation(command.case, {
        x: command.value.x,
        y: command.value.y,
        ...targetInput(command.value.target)
      })
    case 'mouseDown':
    case 'mouseUp':
      return invocation(command.case, {
        button: command.value.button,
        ...targetInput(command.value.target)
      })
    case 'mouseWheel':
      return invocation(command.case, {
        dx: command.value.dx,
        dy: command.value.dy,
        ...targetInput(command.value.target)
      })
    case 'tabList':
    case 'tabShow':
    case 'tabCurrent':
    case 'tabProfileShow':
    case 'tabSwitch':
    case 'tabCreate':
    case 'tabClose':
    case 'profileList':
    case 'profileCreate':
    case 'profileDelete':
    case 'tabSetProfile':
    case 'tabProfileClone':
      return decodeSessionCommand(command)
    case 'cookieGet':
      return invocation(command.case, {
        url: command.value.url,
        ...targetInput(command.value.target)
      })
    case 'cookieSet':
      return invocation(command.case, {
        domain: command.value.domain,
        expires: command.value.expires,
        httpOnly: command.value.httpOnly,
        name: command.value.name,
        path: command.value.path,
        sameSite: command.value.sameSite,
        secure: command.value.secure,
        value: command.value.value,
        ...targetInput(command.value.target)
      })
    case 'cookieDelete':
      return invocation(command.case, {
        domain: command.value.domain,
        name: command.value.name,
        url: command.value.url,
        ...targetInput(command.value.target)
      })
    case 'viewport':
      return invocation(command.case, {
        deviceScaleFactor: command.value.deviceScaleFactor,
        height: command.value.height,
        mobile: command.value.mobile,
        width: command.value.width,
        ...targetInput(command.value.target)
      })
    case 'geolocation':
      return invocation(command.case, {
        accuracy: command.value.accuracy,
        latitude: command.value.latitude,
        longitude: command.value.longitude,
        ...targetInput(command.value.target)
      })
    case 'setDevice':
      return invocation(command.case, {
        name: command.value.name,
        ...targetInput(command.value.target)
      })
    case 'setOffline':
      return invocation(command.case, {
        state: command.value.state,
        ...targetInput(command.value.target)
      })
    case 'setHeaders':
      return invocation(command.case, {
        headers: command.value.headers,
        ...targetInput(command.value.target)
      })
    case 'setCredentials':
      return invocation(command.case, {
        pass: command.value.pass,
        user: command.value.user,
        ...targetInput(command.value.target)
      })
    case 'setMedia':
      return invocation(command.case, {
        colorScheme: command.value.colorScheme,
        reducedMotion: command.value.reducedMotion,
        ...targetInput(command.value.target)
      })
    case 'interceptEnable':
      return invocation(command.case, {
        patterns: command.value.patterns.length > 0 ? command.value.patterns : undefined,
        ...targetInput(command.value.target)
      })
    case 'console':
    case 'network':
      return invocation(command.case, {
        limit: command.value.limit,
        ...targetInput(command.value.target)
      })
    case 'storageLocalGet':
    case 'storageSessionGet':
      return invocation(command.case, {
        key: command.value.key,
        ...targetInput(command.value.target)
      })
    case 'storageLocalSet':
    case 'storageSessionSet':
      return invocation(command.case, {
        key: command.value.key,
        value: command.value.value,
        ...targetInput(command.value.target)
      })
    case 'certificateProceed':
      return invocation(command.case, {
        challengeId: command.value.challengeId,
        ...targetInput(command.value.target)
      })
    case 'grabCancel':
    case 'pageControlOpenDevTools':
    case 'pageControlSetActive':
    case 'grabExtractHover':
    case 'grabSetMode':
    case 'grabAwaitSelection':
    case 'grabCaptureSelection':
    case 'pageControlRegister':
    case 'pageControlUnregister':
    case 'pageControlSetViewportOverride':
    case 'pageControlSetAnnotationViewport':
      return decodePageControlCommand(command)
    case 'mouseClick':
      return invocation(command.case, {
        button: command.value.button,
        modifiers: command.value.modifiers.length > 0 ? command.value.modifiers : undefined,
        radius: command.value.radius,
        x: command.value.x,
        y: command.value.y,
        ...targetInput(command.value.target)
      })
    case 'profileClearDefaultCookies':
    case 'profileDetectBrowsers':
      return invocation(command.case, undefined)
    case 'profileImportFromBrowser':
      return invocation(command.case, {
        browserFamily: command.value.browserFamily,
        browserProfile: command.value.browserProfile,
        profileId: command.value.profileId
      })
    case undefined:
      throw new Error('Browser command is missing')
  }
}
