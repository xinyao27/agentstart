export const GUEST_ARM_SERIALIZATION_SCRIPT = `  var ATTRIBUTE_SCAN_LIMIT = 32;
  var SAFE_ATTRIBUTE_ENTRY_LIMIT = 16;
  var ATTRIBUTE_NAME_MAX_LENGTH = 64;
  var ATTRIBUTE_VALUE_MAX_LENGTH = 500;
  var HTML_SNIPPET_NODE_LIMIT = 120;
  var HTML_SNIPPET_DEPTH_LIMIT = 12;
  var OMITTED_HTML_TAGS = new Set(['script', 'style', 'template']);
  var VOID_HTML_TAGS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
  ]);

  function getSafeAttributes(el) {
    var attrs = {};
    var accepted = 0;
    var inspected = Math.min(el.attributes.length, ATTRIBUTE_SCAN_LIMIT);
    for (var i = 0; i < inspected && accepted < SAFE_ATTRIBUTE_ENTRY_LIMIT; i++) {
      var attr = el.attributes[i];
      if (!attr || attr.name.length > ATTRIBUTE_NAME_MAX_LENGTH) continue;
      var name = attr.name.toLowerCase();
      var isAria = name.indexOf('aria-') === 0;
      if (!SAFE_ATTRS.has(name) && !isAria) continue;
      var value = clampStr(attr.value, ATTRIBUTE_VALUE_MAX_LENGTH);
      if (containsSecret(value)) {
        attrs[name] = '[redacted]';
      } else if ((name === 'href' || name === 'src' || name === 'action') && value) {
        attrs[name] = sanitizeUrl(value);
      } else if (name === 'class') {
        attrs[name] = clampStr(value, 200);
      } else {
        attrs[name] = value;
      }
      accepted++;
    }
    return attrs;
  }

  function getHtmlSnippet(el) {
    var max = BUDGET.htmlSnippetMaxLength;
    var html = '';
    var visited = 0;
    var truncated = false;

    function appendRaw(value) {
      var remaining = max - html.length;
      if (remaining <= 0) {
        truncated = true;
        return false;
      }
      if (value.length > remaining) {
        html += value.slice(0, remaining);
        truncated = true;
        return false;
      }
      html += value;
      return true;
    }

    function appendEscaped(value, attribute) {
      for (var i = 0; i < value.length; i++) {
        var char = value.charAt(i);
        var escaped = char === '&' ? '&amp;' :
          char === '<' ? '&lt;' :
          char === '>' ? '&gt;' :
          attribute && char === '"' ? '&quot;' : char;
        if (!appendRaw(escaped)) return false;
      }
      return true;
    }

    function visit(node, depth) {
      if (truncated) return;
      if (visited >= HTML_SNIPPET_NODE_LIMIT) {
        truncated = true;
        return;
      }
      visited++;
      if (node.nodeType === Node.TEXT_NODE) {
        appendEscaped(node.nodeValue || '', false);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      var element = node;
      var tag = String(element.localName || element.tagName || '').toLowerCase();
      if (!tag || OMITTED_HTML_TAGS.has(tag)) return;
      if (!appendRaw('<' + tag)) return;
      var attrs = getSafeAttributes(element);
      for (var name in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, name)) continue;
        if (!appendRaw(' ' + name + '="')) return;
        if (!appendEscaped(attrs[name], true)) return;
        if (!appendRaw('"')) return;
      }
      if (!appendRaw('>') || VOID_HTML_TAGS.has(tag)) return;
      if (depth >= HTML_SNIPPET_DEPTH_LIMIT && element.firstChild) {
        truncated = true;
      } else {
        var child = element.firstChild;
        while (child && !truncated) {
          visit(child, depth + 1);
          child = child.nextSibling;
        }
      }
      appendRaw('</' + tag + '>');
    }

    try {
      visit(el, 0);
    } catch (e) {
      return '';
    }
    if (!truncated) return html;
    // Why: the contract carries a bounded diagnostic snippet, not a parseable
    // document. Never exceed its hard cap merely to close a partially visited tag.
    var suffix = ' (truncated)';
    return html.slice(0, Math.max(0, max - suffix.length)) + suffix;
  }

`
