export const GUEST_ARM_SELECTOR_SCRIPT = `  function getAriaLabelledByIds(value) {
    var ids = [];
    var tokenStart = -1;
    for (var index = 0; index <= value.length; index++) {
      var isEnd = index === value.length;
      if (!isEnd && !isAriaLabelledBySeparator(value.charCodeAt(index))) {
        if (tokenStart === -1) tokenStart = index;
        continue;
      }
      if (tokenStart !== -1) {
        ids.push(value.slice(tokenStart, index));
        tokenStart = -1;
        if (ids.length >= 32) break;
      }
    }
    return ids;
  }

  function isAriaLabelledBySeparator(code) {
    return code === 32 ||
      (code >= 9 && code <= 13) ||
      code === 160 ||
      code === 5760 ||
      (code >= 8192 && code <= 8202) ||
      code === 8232 ||
      code === 8233 ||
      code === 8239 ||
      code === 8287 ||
      code === 12288 ||
      code === 65279;
  }

  function getAccessibility(el) {
    var role = clampStr(el.getAttribute('role') || el.tagName.toLowerCase(), 100);
    var rawAriaLabel = el.getAttribute('aria-label') || '';
    var rawAriaLabelledBy = el.getAttribute('aria-labelledby') || '';
    var ariaLabel = clampStr(rawAriaLabel, 500) || null;
    var ariaLabelledBy = clampStr(rawAriaLabelledBy, 1000) || null;
    var accessibleName = null;
    if (ariaLabel) {
      accessibleName = ariaLabel;
    } else if (ariaLabelledBy) {
      var parts = getAriaLabelledByIds(ariaLabelledBy);
      var names = [];
      for (var i = 0; i < parts.length; i++) {
        var ref = document.getElementById(parts[i]);
        if (ref) names.push(getBoundedText(ref, 100));
      }
      if (names.length) accessibleName = names.join(' ');
    } else {
      var tag = el.tagName.toLowerCase();
      if (tag === 'button' || tag === 'a' || tag === 'label') {
        accessibleName = getBoundedText(el, 100);
      } else if (el.getAttribute('title')) {
        accessibleName = clampStr(el.getAttribute('title') || '', 500);
      } else if (el.getAttribute('alt')) {
        accessibleName = clampStr(el.getAttribute('alt') || '', 500);
      }
    }
    return {
      role: role,
      accessibleName: accessibleName,
      ariaLabel: ariaLabel,
      ariaLabelledBy: ariaLabelledBy
    };
  }

  function getComputedStyleSubset(el) {
    var cs = window.getComputedStyle(el);
    var result = {};
    for (var i = 0; i < STYLE_PROPS.length; i++) {
      result[STYLE_PROPS[i]] = cs.getPropertyValue(
        STYLE_PROPS[i].replace(/[A-Z]/g, function(m) { return '-' + m.toLowerCase(); })
      ).slice(0, 500) || '';
    }
    return result;
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }
    return String(value).replace(/[^a-zA-Z0-9_-]/g, function(ch) {
      return '\\\\' + ch;
    });
  }

  function looksHashy(value) {
    return /^[A-Za-z0-9_-]{12,}$/.test(value) && /\\d/.test(value) && /[A-Z]/.test(value);
  }

  function getStableClasses(el, maxCount) {
    if (!el.classList) return [];
    var result = [];
    for (var i = 0; i < el.classList.length && i < 32 && result.length < maxCount; i++) {
      var cls = el.classList[i];
      if (!cls || cls.length > 60 || containsSecret(cls)) continue;
      if (/^css-[a-z0-9]+$/i.test(cls) || looksHashy(cls)) continue;
      result.push(cls);
    }
    return result;
  }

  function buildSelectorPart(el) {
    var tag = el.tagName.toLowerCase();
    var id = clampStr(el.id || '', 200);
    if (id && !containsSecret(id)) {
      return tag + '#' + cssEscape(id);
    }
    var classes = getStableClasses(el, 2);
    if (classes.length > 0) {
      return tag + classes.map(function(cls) { return '.' + cssEscape(cls); }).join('');
    }
    return tag;
  }

  function selectorTargetsElement(selector, target) {
    try {
      return document.querySelector(selector) === target;
    } catch(e) {
      return false;
    }
  }

  function getNthOfTypeSuffix(current) {
    var tag = current.tagName;
    var index = 1;
    var inspected = 0;
    var sibling = current.previousElementSibling;
    while (sibling && inspected < 200) {
      if (sibling.tagName === tag) index++;
      sibling = sibling.previousElementSibling;
      inspected++;
    }
    if (sibling) return '';
    if (index > 1) return ':nth-of-type(' + index + ')';

    sibling = current.nextElementSibling;
    inspected = 0;
    while (sibling && inspected < 200) {
      if (sibling.tagName === tag) return ':nth-of-type(1)';
      sibling = sibling.nextElementSibling;
      inspected++;
    }
    return '';
  }

  function buildSelector(el) {
    var parts = [];
    var current = el;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body && parts.length < 10) {
      var part = buildSelectorPart(current);
      var parent = current.parentElement;
      if (parent && !selectorTargetsElement(parts.concat([part]).reverse().join(' > '), el)) {
        part += getNthOfTypeSuffix(current);
      }
      parts.unshift(part);
      var selector = parts.join(' > ');
      if (selectorTargetsElement(selector, el)) {
        return clampStr(selector, BUDGET.selectorMaxLength);
      }
      current = parent;
    }
    return clampStr(parts.join(' > ') || el.tagName.toLowerCase(), BUDGET.selectorMaxLength);
  }

  function buildReadablePath(el) {
    var parts = [];
    var current = el;
    while (current && current !== document.documentElement && parts.length < 6) {
      var tag = current.tagName.toLowerCase();
      if (tag === 'html' || tag === 'body') break;
      var label = tag;
      var aria = clampStr(current.getAttribute('aria-label') || '', 100);
      var role = clampStr(current.getAttribute('role') || '', 100);
      var stableClasses = getStableClasses(current, 1);
      if (current.id && !containsSecret(current.id)) {
        label = '#' + cssEscape(current.id);
      } else if (aria && !containsSecret(aria)) {
        label = tag + '[aria-label="' + clampStr(aria, 40).replace(/"/g, '\\\\"') + '"]';
      } else if (role && !containsSecret(role)) {
        label = tag + '[role="' + clampStr(role, 30).replace(/"/g, '\\\\"') + '"]';
      } else if (stableClasses.length > 0) {
        label = '.' + cssEscape(stableClasses[0]);
      }
      parts.unshift(label);
      current = current.parentElement;
    }
    return clampStr(parts.join(' > '), BUDGET.pathMaxLength);
  }

  function buildFullPath(el) {
    var parts = [];
    var current = el;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement && parts.length < 20) {
      parts.unshift(buildSelectorPart(current));
      current = current.parentElement;
    }
    return clampStr(parts.join(' > '), BUDGET.pathMaxLength);
  }

`
