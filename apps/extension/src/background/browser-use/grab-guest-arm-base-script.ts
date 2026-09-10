export const GUEST_ARM_BASE_SCRIPT = `(function() {
  'use strict';

  // Why: page-owned lookalike state must never substitute its extractor for ours.
  if (window.__agentstartGrab) {
    try {
      if (typeof window.__agentstartGrab.cleanup === 'function') {
        window.__agentstartGrab.cleanup();
      }
    } catch(e) {}
    delete window.__agentstartGrab;
  }

  var BUDGET = {
    textSnippetMaxLength: 200,
    nearbyTextEntryMaxLength: 200,
    nearbyTextMaxEntries: 10,
    htmlSnippetMaxLength: 4096,
    ancestorPathMaxEntries: 10,
    nearbyElementsMaxEntries: 6,
    nearbyElementMaxLength: 160,
    selectorMaxLength: 700,
    pathMaxLength: 900,
    cssClassesMaxLength: 500,
    selectedTextMaxLength: 500,
    sourceFileMaxLength: 500,
    reactComponentsMaxLength: 500
  };
  var TEXT_NODE_SCAN_LIMIT = 80;
  var NEARBY_ELEMENT_SCAN_LIMIT = 80;

  var SAFE_ATTRS = new Set([
    'id', 'class', 'name', 'type', 'role', 'href', 'src', 'alt',
    'title', 'placeholder', 'for', 'action', 'method'
  ]);

  var SECRET_PATTERNS = [
    'access_token', 'auth_token', 'api_key', 'apikey', 'client_secret',
    'oauth_state', 'x-amz-', 'session_id', 'sessionid', 'csrf',
    'secret', 'password', 'passwd'
  ];

  var SAFE_URL_PROTOCOLS = new Set(['http:', 'https:', 'file:']);

  var STYLE_PROPS = [
    'display', 'position', 'width', 'height', 'margin', 'padding',
    'color', 'backgroundColor', 'border', 'borderRadius', 'fontFamily',
    'fontSize', 'fontWeight', 'lineHeight', 'textAlign', 'zIndex'
  ];

  function clampStr(s, max) {
    if (!s || typeof s !== 'string') return '';
    if (s.length <= max) return s;
    var suffix = ' (truncated)';
    if (max <= suffix.length) return s.slice(0, max);
    return s.slice(0, max - suffix.length) + suffix;
  }

  function containsSecret(value) {
    if (!value) return false;
    var lower = value.toLowerCase();
    for (var i = 0; i < SECRET_PATTERNS.length; i++) {
      if (lower.indexOf(SECRET_PATTERNS[i]) !== -1) return true;
    }
    return false;
  }

  function sanitizeUrl(url) {
    try {
      var u = new URL(url);
      if (u.protocol === 'about:') {
        return u.toString() === 'about:blank' ? 'about:blank' : '';
      }
      if (!SAFE_URL_PROTOCOLS.has(u.protocol)) {
        return '';
      }
      u.search = '';
      u.hash = '';
      return u.toString();
    } catch (e) {
      // Why: returning an unparseable URL could preserve an executable scheme or secret.
      return '';
    }
  }

  function createTextAccumulator() {
    return { text: '', pendingSpace: false };
  }

  function isWhitespaceCode(code) {
    return code === 32 || (code >= 9 && code <= 13) || code === 160 ||
      code === 5760 || (code >= 8192 && code <= 8202) || code === 8232 ||
      code === 8233 || code === 8239 || code === 8287 || code === 12288 ||
      code === 65279;
  }

  function appendTextSeparator(acc) {
    if (acc.text.length > 0) acc.pendingSpace = true;
  }

  function appendNormalizedText(acc, text, max) {
    var limit = max + 20;
    var value = String(text || '');
    for (var i = 0; i < value.length && acc.text.length < limit; i++) {
      var code = value.charCodeAt(i);
      if (isWhitespaceCode(code)) {
        if (acc.text.length > 0) acc.pendingSpace = true;
        continue;
      }
      if (acc.pendingSpace) {
        acc.text += ' ';
        acc.pendingSpace = false;
        if (acc.text.length >= limit) break;
      }
      acc.text += value.charAt(i);
    }
  }

  function finishAccumulatedText(acc, max) {
    return clampStr(acc.text, max);
  }

  function getBoundedText(el, max) {
    try {
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      var acc = createTextAccumulator();
      var inspected = 0;
      var node = walker.nextNode();
      while (node && acc.text.length < max + 20 && inspected < TEXT_NODE_SCAN_LIMIT) {
        inspected++;
        appendTextSeparator(acc);
        var remaining = max + 20 - acc.text.length - (acc.pendingSpace ? 1 : 0);
        if (remaining <= 0) break;
        appendNormalizedText(acc, (node.nodeValue || '').slice(0, remaining), max);
        node = walker.nextNode();
      }
      return finishAccumulatedText(acc, max);
    } catch (e) {
      return '';
    }
  }

  function getTextSnippet(el) {
    return getBoundedText(el, BUDGET.textSnippetMaxLength);
  }

  function getSelectedText() {
    try {
      var selection = window.getSelection ? window.getSelection() : null;
      if (!selection || selection.rangeCount === 0) return '';
      var acc = createTextAccumulator();
      var inspected = 0;
      for (
        var i = 0;
        i < selection.rangeCount &&
          inspected < TEXT_NODE_SCAN_LIMIT &&
          acc.text.length < BUDGET.selectedTextMaxLength + 20;
        i++
      ) {
        var range = selection.getRangeAt(i);
        var walkerRoot = range.commonAncestorContainer;
        var walker = document.createTreeWalker(
          walkerRoot,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: function(node) {
              if (range.intersectsNode && !range.intersectsNode(node)) {
                return NodeFilter.FILTER_REJECT;
              }
              return NodeFilter.FILTER_ACCEPT;
            }
          }
        );
        var node = walkerRoot.nodeType === Node.TEXT_NODE ? walkerRoot : walker.nextNode();
        while (
          node &&
          acc.text.length < BUDGET.selectedTextMaxLength + 20 &&
          inspected < TEXT_NODE_SCAN_LIMIT
        ) {
          inspected++;
          var textNode = node;
          var value = textNode.nodeValue || '';
          appendTextSeparator(acc);
          var remaining =
            BUDGET.selectedTextMaxLength + 20 - acc.text.length - (acc.pendingSpace ? 1 : 0);
          if (remaining <= 0) break;
          if (value) {
            var start = textNode === range.startContainer ? range.startOffset : 0;
            var end = textNode === range.endContainer ? range.endOffset : value.length;
            if (end > start + remaining) {
              end = start + remaining;
            }
            if (textNode === range.startContainer) {
              start = Math.min(start, value.length);
            }
            value = value.slice(start, end);
            appendNormalizedText(acc, value, BUDGET.selectedTextMaxLength);
          }
          node = walker.nextNode();
        }
      }
      return finishAccumulatedText(acc, BUDGET.selectedTextMaxLength);
    } catch (e) {
      return '';
    }
  }

  // Why: guest-controlled aria-labelledby must not trigger unbounded tokenization.
`
