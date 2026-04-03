const STORAGE_KEY = 'zog.liveKeybindings.v1';

const ACTIONS = ['start', 'stop', 'switch', 'nextMatch', 'winParticipant1', 'winParticipant2'];

export const DEFAULT_KEYBINDINGS = {
  start: { type: 'keyboard', key: 'KeyS', ctrl: false, shift: false, alt: false, meta: false },
  stop: { type: 'keyboard', key: 'KeyA', ctrl: false, shift: false, alt: false, meta: false },
  switch: { type: 'keyboard', key: 'KeyD', ctrl: false, shift: false, alt: false, meta: false },
  nextMatch: { type: 'keyboard', key: 'KeyF', ctrl: false, shift: false, alt: false, meta: false },
  winParticipant1: { type: 'keyboard', key: 'KeyQ', ctrl: false, shift: false, alt: false, meta: false },
  winParticipant2: { type: 'keyboard', key: 'KeyE', ctrl: false, shift: false, alt: false, meta: false },
};

function normalizeKeyboardBinding(binding = {}) {
  const key = String(binding.key || '').trim();
  if (!key) {
    return null;
  }

  return {
    type: 'keyboard',
    key,
    ctrl: Boolean(binding.ctrl),
    shift: Boolean(binding.shift),
    alt: Boolean(binding.alt),
    meta: Boolean(binding.meta),
  };
}

function normalizeMouseBinding(binding = {}) {
  const button = Number(binding.button);
  if (!Number.isInteger(button) || button < 0) {
    return null;
  }

  return {
    type: 'mouse',
    button,
    ctrl: Boolean(binding.ctrl),
    shift: Boolean(binding.shift),
    alt: Boolean(binding.alt),
    meta: Boolean(binding.meta),
  };
}

export function normalizeBinding(binding) {
  if (!binding || typeof binding !== 'object') {
    return null;
  }

  if (binding.type === 'mouse') {
    return normalizeMouseBinding(binding);
  }

  return normalizeKeyboardBinding(binding);
}

export function normalizeKeybindings(value) {
  const normalized = {};
  const source = value && typeof value === 'object' ? value : {};

  for (const action of ACTIONS) {
    const hasOwnValue = Object.prototype.hasOwnProperty.call(source, action);
    const rawBinding = source[action];
    if (hasOwnValue && rawBinding === null) {
      normalized[action] = null;
      continue;
    }

    normalized[action] = normalizeBinding(rawBinding) || DEFAULT_KEYBINDINGS[action];
  }

  return normalized;
}

function areModifiersEqual(left, right) {
  return (
    Boolean(left.ctrl) === Boolean(right.ctrl) &&
    Boolean(left.shift) === Boolean(right.shift) &&
    Boolean(left.alt) === Boolean(right.alt) &&
    Boolean(left.meta) === Boolean(right.meta)
  );
}

export function isSameBinding(left, right) {
  if (!left || !right || left.type !== right.type) {
    return false;
  }

  if (!areModifiersEqual(left, right)) {
    return false;
  }

  if (left.type === 'mouse') {
    return left.button === right.button;
  }

  return left.key === right.key;
}

function loadBindingsFromStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return normalizeKeybindings(DEFAULT_KEYBINDINGS);
    }

    const parsed = JSON.parse(raw);
    return normalizeKeybindings(parsed);
  } catch (error) {
    console.warn('Impossible de charger les raccourcis, réinitialisation par défaut.', error);
    return normalizeKeybindings(DEFAULT_KEYBINDINGS);
  }
}

function persistBindings(bindings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
  } catch (error) {
    console.warn('Impossible de sauvegarder les raccourcis.', error);
  }
}

function labelFromKeyCode(code) {
  if (!code) {
    return '';
  }

  const letterMatch = code.match(/^Key([A-Z])$/);
  if (letterMatch) {
    return letterMatch[1];
  }

  const digitMatch = code.match(/^Digit([0-9])$/);
  if (digitMatch) {
    return digitMatch[1];
  }

  const functionMatch = code.match(/^F([0-9]{1,2})$/);
  if (functionMatch) {
    return `F${functionMatch[1]}`;
  }

  const labels = {
    Space: 'Space',
    Enter: 'Enter',
    Escape: 'Escape',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Delete: 'Delete',
    ArrowUp: 'Arrow Up',
    ArrowDown: 'Arrow Down',
    ArrowLeft: 'Arrow Left',
    ArrowRight: 'Arrow Right',
    Home: 'Home',
    End: 'End',
    PageUp: 'Page Up',
    PageDown: 'Page Down',
    Insert: 'Insert',
  };

  return labels[code] || code;
}

function getMouseButtonLabel(button) {
  if (button === 0) return 'Mouse Left';
  if (button === 1) return 'Mouse Middle';
  if (button === 2) return 'Mouse Right';
  return `Mouse Button ${button}`;
}

export function formatBinding(binding) {
  if (!binding) {
    return 'Non défini';
  }

  const parts = [];
  if (binding.ctrl) parts.push('Ctrl');
  if (binding.shift) parts.push('Shift');
  if (binding.alt) parts.push('Alt');
  if (binding.meta) parts.push('Meta');

  if (binding.type === 'mouse') {
    parts.push(getMouseButtonLabel(binding.button));
  } else {
    parts.push(labelFromKeyCode(binding.key));
  }

  return parts.filter(Boolean).join(' + ') || 'Non défini';
}

function bindingFromKeyboardEvent(event) {
  return normalizeKeyboardBinding({
    key: event.code,
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
    meta: event.metaKey,
  });
}

function bindingFromMouseEvent(event) {
  return normalizeMouseBinding({
    button: event.button,
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
    meta: event.metaKey,
  });
}

function bindingMatchesKeyboardEvent(binding, event) {
  return (
    binding?.type === 'keyboard' &&
    binding.key === event.code &&
    Boolean(binding.ctrl) === event.ctrlKey &&
    Boolean(binding.shift) === event.shiftKey &&
    Boolean(binding.alt) === event.altKey &&
    Boolean(binding.meta) === event.metaKey
  );
}

function bindingMatchesMouseEvent(binding, event) {
  return (
    binding?.type === 'mouse' &&
    binding.button === event.button &&
    Boolean(binding.ctrl) === event.ctrlKey &&
    Boolean(binding.shift) === event.shiftKey &&
    Boolean(binding.alt) === event.altKey &&
    Boolean(binding.meta) === event.metaKey
  );
}

export function createKeybindingManager({ onAction, shouldIgnoreEvent }) {
  let bindings = loadBindingsFromStorage();
  let captureAction = null;

  function setBindings(nextBindings) {
    bindings = normalizeKeybindings(nextBindings);
    persistBindings(bindings);
  }

  function getBindings() {
    return bindings;
  }

  function findConflict(action, candidate) {
    const conflictAction = ACTIONS.find((name) => name !== action && isSameBinding(bindings[name], candidate));
    return conflictAction || null;
  }

  function assignBinding(action, binding) {
    if (!ACTIONS.includes(action)) {
      return { updated: false, conflictAction: null };
    }

    const safeBinding = normalizeBinding(binding);
    if (!safeBinding) {
      return { updated: false, conflictAction: null };
    }

    const conflictAction = findConflict(action, safeBinding);
    const next = { ...bindings, [action]: safeBinding };
    if (conflictAction) {
      next[conflictAction] = null;
    }

    setBindings(next);
    return { updated: true, conflictAction };
  }

  function resetBindings() {
    setBindings(DEFAULT_KEYBINDINGS);
  }

  function beginCapture(action) {
    captureAction = ACTIONS.includes(action) ? action : null;
  }

  function cancelCapture() {
    captureAction = null;
  }

  function maybeIgnore(event) {
    return typeof shouldIgnoreEvent === 'function' && shouldIgnoreEvent(event);
  }

  function handleCaptureFromBinding(candidate) {
    if (!captureAction || !candidate) {
      return;
    }

    const action = captureAction;
    captureAction = null;
    const result = assignBinding(action, candidate);
    window.dispatchEvent(
      new CustomEvent('zog:keybindings-updated', {
        detail: {
          action,
          conflictAction: result.conflictAction,
        },
      })
    );
  }

  function onKeyDown(event) {
    if (event.repeat) {
      return;
    }

    if (captureAction) {
      if (event.code === 'Escape') {
        captureAction = null;
        window.dispatchEvent(
          new CustomEvent('zog:keybindings-capture-cancelled', {
            detail: {},
          })
        );
        return;
      }
      event.preventDefault();
      handleCaptureFromBinding(bindingFromKeyboardEvent(event));
      return;
    }

    if (maybeIgnore(event)) {
      return;
    }

    for (const action of ACTIONS) {
      const binding = bindings[action];
      if (bindingMatchesKeyboardEvent(binding, event)) {
        event.preventDefault();
        onAction(action);
        return;
      }
    }
  }

  function onMouseDown(event) {
    if (captureAction) {
      event.preventDefault();
      handleCaptureFromBinding(bindingFromMouseEvent(event));
      return;
    }

    if (maybeIgnore(event)) {
      return;
    }

    for (const action of ACTIONS) {
      const binding = bindings[action];
      if (bindingMatchesMouseEvent(binding, event)) {
        event.preventDefault();
        onAction(action);
        return;
      }
    }
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('mousedown', onMouseDown);

  function destroy() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('mousedown', onMouseDown);
  }

  return {
    getBindings,
    beginCapture,
    cancelCapture,
    resetBindings,
    assignBinding,
    destroy,
    get captureAction() {
      return captureAction;
    },
  };
}
