import { ARM_SCRIPT } from './grab-guest-arm-script'

type GuestScriptAction = 'arm' | 'awaitClick' | 'finalize' | 'extractHover' | 'teardown'

export function buildGuestOverlayScript(action: GuestScriptAction): string {
  switch (action) {
    case 'arm':
      return ARM_SCRIPT
    case 'awaitClick':
      return AWAIT_CLICK_SCRIPT
    case 'finalize':
      return FINALIZE_SCRIPT
    case 'extractHover':
      return EXTRACT_HOVER_SCRIPT
    case 'teardown':
      return TEARDOWN_SCRIPT
  }
}

const AWAIT_CLICK_SCRIPT = `new Promise(function(resolve, reject) {
  'use strict';
  var grab = window.__agentstartGrab;
  if (!grab) {
    reject(new Error('Grab not armed'));
    return;
  }

  function extractSelectedPayload(el) {
    try {
      return grab.extractPayload(el);
    } catch (error) {
      grab.cleanup();
      reject(error instanceof Error ? error : new Error('Failed to extract element context'));
      return null;
    }
  }

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    grab.host.removeEventListener('click', onClick, true);
    grab.host.removeEventListener('contextmenu', onContext, true);
    var el = grab.getCurrentElement();
    if (!el) {
      grab.cleanup();
      reject(new Error('cancelled'));
      return;
    }
    var payload = extractSelectedPayload(el);
    if (!payload) return;
    // Why: the copy menu needs the chosen element to remain visible until re-arm or teardown.
    grab.freezeHighlight();
    resolve(payload);
  }

  function onContext(e) {
    // Why: right-click must preserve the legacy secondary-action path instead of auto-copying.
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    grab.host.removeEventListener('click', onClick, true);
    grab.host.removeEventListener('contextmenu', onContext, true);
    var el = grab.getCurrentElement();
    if (!el) {
      grab.cleanup();
      reject(new Error('cancelled'));
      return;
    }
    var payload = extractSelectedPayload(el);
    if (!payload) return;
    grab.freezeHighlight();
    resolve({ __agentstartContextMenu: true, payload: payload });
  }

  grab.host.addEventListener('click', onClick, true);
  grab.host.addEventListener('contextmenu', onContext, true);

  grab.cancelAwait = function() {
    grab.host.removeEventListener('click', onClick, true);
    grab.host.removeEventListener('contextmenu', onContext, true);
    grab.cleanup();
    // Why: teardown is a normal cancellation path, so it must not surface as a page error.
    resolve({ __agentstartCancelled: true });
  };
})`

const FINALIZE_SCRIPT = `(function() {
  'use strict';
  var grab = window.__agentstartGrab;
  if (!grab) return null;
  var el = grab.getCurrentElement();
  if (!el) return null;
  var payload = null;
  try {
    payload = grab.extractPayload(el);
  } catch (e) {
    grab.cleanup();
    return null;
  }
  grab.cleanup();
  return payload;
})()`

const EXTRACT_HOVER_SCRIPT = `(function() {
  'use strict';
  var grab = window.__agentstartGrab;
  if (!grab) return null;
  var el = grab.getCurrentElement();
  if (!el) return null;
  try {
    return grab.extractPayload(el);
  } catch (e) {
    return null;
  }
})()`

const TEARDOWN_SCRIPT = `(function() {
  'use strict';
  var grab = window.__agentstartGrab;
  if (!grab) return true;
  if (grab.cancelAwait) {
    grab.cancelAwait();
  } else {
    grab.cleanup();
  }
  return true;
})()`
