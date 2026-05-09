import {
  child,
  connectedRef,
  DEFAULT_PRODUCT_KEY,
  get,
  getAuthRefs,
  getProductRefsBySlug,
  legacyRootRef,
  onValue,
  push,
  ref,
  remove,
  set,
  update,
} from '../shared/firebase.js';
import {
  BRACKET_SIZE,
  computeWinner,
  createTournament,
  getOverlayMatches,
  getRoundTitle,
  normalizeTournament,
  updateMatchWinner,
  canPlayMatch,
} from '../shared/tournament.js';
import { escapeHtml, normalizeImageUrl } from '../shared/view-helpers.js';
import { createKeybindingManager, formatBinding } from '../shared/keybindings.js';
import { USERNAME_REGEX } from '../shared/validation.js';
import {
  DEFAULT_DUEL_CHARACTER_NAME_COLOR,
  DEFAULT_DUEL_FONT_SIZES,
  DEFAULT_DUEL_FIGHTER_PSEUDO_COLOR,
  DEFAULT_DUEL_IMAGE_HEIGHT_PX,
  DEFAULT_DUEL_IMAGE_OFFSET_X_PX,
  DEFAULT_DUEL_IMAGE_OFFSET_Y_PX,
  DEFAULT_DUEL_TEXT_COLOR,
  DEFAULT_DUEL_TIMER_LABEL_COLOR,
  DEFAULT_DUEL_TIMER_OFFSET_Y_PX,
  DEFAULT_DUEL_TIMER_TEXT_COLOR,
  DEFAULT_DUEL_TEXT_SHADOW,
  DEFAULT_TIMER_HEALTH_CONFIG,
  DEFAULT_TIMER_INITIAL_SECONDS,
  DEFAULT_TIMER_LABEL_1,
  DEFAULT_TIMER_LABEL_2,
  DEFAULT_TIMER_PROFILE,
  createDefaultOverlayStyleState,
  normalizeDuelFontSizes,
  normalizeDuelTextShadow,
  normalizeDuelTimerState,
  normalizeTimerHealthConfig,
  sanitizeColor,
  sanitizeDuelImageHeight,
  sanitizeDuelImageOffsetX,
  sanitizeDuelImageOffsetY,
  sanitizeDuelTimerOffsetY,
  sanitizeInteger,
  sanitizeRange,
  sanitizeTextColor,
  sanitizeTimerInitialSeconds,
  sanitizeTimerLabel,
  sanitizeTimerProfile,
} from '../shared/duel-overlay-settings.js';
import {
  resetTimerState as resetSharedTimerState,
  startTimerForParticipant,
  stopTimerState,
  switchTimerParticipant,
  tickTimerState,
  TIMER_STATUS,
} from '../shared/timer-state.js';

const MAX_ACCOUNTS = 2;
const authRefs = getAuthRefs();
const pageParams = new URLSearchParams(window.location.search);
const activeProductSlug = pageParams.get('product');
let activeProfileId = String(pageParams.get('profile') || '').trim() || null;
let activeProductRefs = getProductRefsBySlug(activeProductSlug || DEFAULT_PRODUCT_KEY, activeProfileId);
const loginSection = document.getElementById('loginSection');
const appSection = document.getElementById('appSection');
const productTabs = Array.from(document.querySelectorAll('[data-product-tab]'));
const productViews = Array.from(document.querySelectorAll('[data-product-view]'));
const connectionStatus = document.getElementById('connectionStatus');
const createProfileForm = document.getElementById('createProfileForm');
const createProfileMessage = document.getElementById('createProfileMessage');
const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const logoutBtn = document.getElementById('logoutBtn');
const navItems = Array.from(document.querySelectorAll('.app-nav-item[data-target-view]'));
const appViews = Array.from(document.querySelectorAll('.app-view'));

const participantForm = document.getElementById('participantForm');
const participantFormTitle = document.getElementById('participantFormTitle');
const participantsList = document.getElementById('participantsList');
const participantMessage = document.getElementById('participantMessage');
const participantImageInput = document.getElementById('image');
const participantImagePresetSelect = document.getElementById('participantImagePreset');
const editParticipantIdField = document.getElementById('editParticipantId');
const participantSubmitBtn = document.getElementById('participantSubmitBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const clearParticipantsBtn = document.getElementById('clearParticipantsBtn');

const generateBracketBtn = document.getElementById('generateBracketBtn');
const bracketSeedingModeSelect = document.getElementById('bracketSeedingMode');
const bracketContainer = document.getElementById('bracketContainer');
const liveBracketContainer = document.getElementById('liveBracketContainer');
const openDuelOverlayBtn = document.getElementById('openDuelOverlayBtn');
const openTreeOverlayBtn = document.getElementById('openTreeOverlayBtn');
const overlayPrevBtn = document.getElementById('overlayPrevBtn');
const overlayNextBtn = document.getElementById('overlayNextBtn');
const duelImageHeightInput = document.getElementById('duelImageHeightPx');
const duelImageOffsetXInput = document.getElementById('duelImageOffsetXPx');
const duelImageOffsetYInput = document.getElementById('duelImageOffsetYPx');
const duelTextColorInput = document.getElementById('duelTextColor');
const duelTimerTextColorInput = document.getElementById('duelTimerTextColor');
const duelTimerLabelColorInput = document.getElementById('duelTimerLabelColor');
const duelCharacterNameColorInput = document.getElementById('duelCharacterNameColor');
const duelFighterPseudoColorInput = document.getElementById('duelFighterPseudoColor');
const duelTextShadowEnabledInput = document.getElementById('duelTextShadowEnabled');
const duelTextShadowColorInput = document.getElementById('duelTextShadowColor');
const duelTextShadowBlurInput = document.getElementById('duelTextShadowBlurPx');
const duelTextShadowOffsetXInput = document.getElementById('duelTextShadowOffsetXPx');
const duelTextShadowOffsetYInput = document.getElementById('duelTextShadowOffsetYPx');
const duelTimerValueFontSizeInput = document.getElementById('duelTimerValueFontSizePx');
const duelTimerLabelFontSizeInput = document.getElementById('duelTimerLabelFontSizePx');
const duelCharacterFontSizeInput = document.getElementById('duelCharacterFontSizePx');
const duelFighterPseudoFontSizeInput = document.getElementById('duelFighterPseudoFontSizePx');
const duelTimerProfileSelect = document.getElementById('duelTimerProfile');
const duelHealthBarsEnabledInput = document.getElementById('duelHealthBarsEnabled');
const duelHealthBarHeightInput = document.getElementById('duelHealthBarHeightPx');
const duelHealthBarWidthInput = document.getElementById('duelHealthBarWidthPercent');
const duelHealthMainColorInput = document.getElementById('duelHealthMainColor');
const duelHealthWarningColorInput = document.getElementById('duelHealthWarningColor');
const duelHealthDangerColorInput = document.getElementById('duelHealthDangerColor');
const duelHealthAnimationIntensityInput = document.getElementById('duelHealthAnimationIntensity');
const duelHealthDangerEffectsInput = document.getElementById('duelHealthDangerEffects');
const duelTimerOffsetYInput = document.getElementById('duelTimerOffsetYPx');
const liveTimerInitialSecondsInput = document.getElementById('liveTimerInitialSeconds');
const timerStartParticipantSelect = document.getElementById('timerStartParticipant');
const timerStartBtn = document.getElementById('timerStartBtn');
const timerStopBtn = document.getElementById('timerStopBtn');
const timerSwitchBtn = document.getElementById('timerSwitchBtn');
const liveWinnerParticipant1Btn = document.getElementById('liveWinnerParticipant1Btn');
const liveWinnerParticipant2Btn = document.getElementById('liveWinnerParticipant2Btn');
const liveTimerStatus = document.getElementById('liveTimerStatus');
const liveCountdownP1 = document.getElementById('liveCountdownP1');
const liveCountdownP2 = document.getElementById('liveCountdownP2');
const keybindingStatus = document.getElementById('keybindingStatus');
const bindStartBtn = document.getElementById('bindStartBtn');
const bindStopBtn = document.getElementById('bindStopBtn');
const bindSwitchBtn = document.getElementById('bindSwitchBtn');
const bindNextMatchBtn = document.getElementById('bindNextMatchBtn');
const bindWinParticipant1Btn = document.getElementById('bindWinParticipant1Btn');
const bindWinParticipant2Btn = document.getElementById('bindWinParticipant2Btn');
const bindingDisplayStart = document.getElementById('bindingDisplayStart');
const bindingDisplayStop = document.getElementById('bindingDisplayStop');
const bindingDisplaySwitch = document.getElementById('bindingDisplaySwitch');
const bindingDisplayNextMatch = document.getElementById('bindingDisplayNextMatch');
const bindingDisplayWinParticipant1 = document.getElementById('bindingDisplayWinParticipant1');
const bindingDisplayWinParticipant2 = document.getElementById('bindingDisplayWinParticipant2');
const resetBindingsBtn = document.getElementById('resetBindingsBtn');

const QUIZ_OVERLAY_WIDTH_PX = 1920;
const QUIZ_OVERLAY_HEIGHT_PX = 1080;
const DEFAULT_QUIZ_QA_RECT = {
  x1: 560,
  y1: 260,
  x2: 1360,
  y2: 760,
};
const TIMER_TICK_INTERVAL_MS = 250;
const TIMER_SECOND_MS = 1000;

let usersCache = [];
let participantsCache = [];
let participantImagePresetPaths = [];
let tournamentCache = null;
let currentProfile = null;
let currentOverlay = {
  matchIndex: 0,
  ...createDefaultOverlayStyleState(),
  timer: null,
};
let isConnected = false;
let usersLoaded = false;
let timerTickHandle = null;
let keybindingManager = null;

const KEYBINDING_ACTION_LABELS = {
  start: 'Démarrer',
  stop: 'Arrêter',
  switch: 'Basculer le timer',
  nextMatch: 'Passer au duel suivant',
  winParticipant1: 'Victoire participant 1',
  winParticipant2: 'Victoire participant 2',
};

const KEYBINDING_UI = {
  start: {
    display: bindingDisplayStart,
    button: bindStartBtn,
  },
  stop: {
    display: bindingDisplayStop,
    button: bindStopBtn,
  },
  switch: {
    display: bindingDisplaySwitch,
    button: bindSwitchBtn,
  },
  nextMatch: {
    display: bindingDisplayNextMatch,
    button: bindNextMatchBtn,
  },
  winParticipant1: {
    display: bindingDisplayWinParticipant1,
    button: bindWinParticipant1Btn,
  },
  winParticipant2: {
    display: bindingDisplayWinParticipant2,
    button: bindWinParticipant2Btn,
  },
};

function normalizeTimerState(timerValue = {}) {
  return normalizeDuelTimerState(timerValue);
}

function resetTimerState(timer, now = Date.now(), labels = null) {
  return normalizeTimerState(resetSharedTimerState(normalizeTimerState(timer), now, labels));
}

function resolveTimerNow(baseTimer, now = Date.now()) {
  return normalizeTimerState(tickTimerState(baseTimer, now));
}

function getResolvedCurrentTimer(now = Date.now()) {
  return resolveTimerNow(currentOverlay.timer, now);
}

async function persistTimerTick() {
  const timer = normalizeTimerState(currentOverlay.timer);
  if (!timer.activeParticipant) {
    return;
  }

  const nextTimer = resolveTimerNow(timer, Date.now());
  const hasChanged =
    nextTimer.participant1.remainingMs !== timer.participant1.remainingMs ||
    nextTimer.participant2.remainingMs !== timer.participant2.remainingMs ||
    nextTimer.participant1.status !== timer.participant1.status ||
    nextTimer.participant2.status !== timer.participant2.status ||
    nextTimer.activeParticipant !== timer.activeParticipant;
  if (!hasChanged) {
    return;
  }

  await setOverlayTimer(nextTimer);
}

function isEditableElement(element) {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  );
}

function isTextEntryActive() {
  return isEditableElement(document.activeElement);
}

function isInteractiveControlTarget(target) {
  return (
    target instanceof Element &&
    Boolean(target.closest('button, input, textarea, select, label, a, [role="button"]'))
  );
}

function parseViewFromHash() {
  const normalized = String(window.location.hash || '')
    .replace('#', '')
    .trim()
    .toLowerCase();
  return ['participants', 'config', 'keybinds', 'live'].includes(normalized) ? normalized : 'participants';
}

function renderActiveView(viewName) {
  appViews.forEach((view) => {
    const isActive = view.dataset.view === viewName;
    view.classList.toggle('is-active', isActive);
    view.setAttribute('aria-hidden', String(!isActive));
  });

  navItems.forEach((item) => {
    const isActive = item.dataset.targetView === viewName;
    item.classList.toggle('is-active', isActive);
    item.setAttribute('aria-current', isActive ? 'page' : 'false');
  });
}

function formatMsToClock(value) {
  const safeMs = Math.max(0, Math.round(Number(value) || 0));
  const totalSeconds = Math.floor(safeMs / TIMER_SECOND_MS);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function renderLiveTimerPanel() {
  const timer = normalizeTimerState(currentOverlay.timer);
  const activeParticipant = timer.activeParticipant;
  const participant1Ms = timer.participant1.remainingMs;
  const participant2Ms = timer.participant2.remainingMs;

  if (liveCountdownP1) {
    liveCountdownP1.textContent = `${timer.participant1Label}: ${formatMsToClock(participant1Ms)}`;
    liveCountdownP1.classList.toggle('is-active', Boolean(activeParticipant === 1 && timer.participant1.isRunning));
  }

  if (liveCountdownP2) {
    liveCountdownP2.textContent = `${timer.participant2Label}: ${formatMsToClock(participant2Ms)}`;
    liveCountdownP2.classList.toggle('is-active', Boolean(activeParticipant === 2 && timer.participant2.isRunning));
  }

  if (!liveTimerStatus) {
    return;
  }

  if (!activeParticipant) {
    if (timer.participant1.status === TIMER_STATUS.FINISHED || timer.participant2.status === TIMER_STATUS.FINISHED) {
      const endedLabel = timer.participant1.status === TIMER_STATUS.FINISHED ? timer.participant1Label : timer.participant2Label;
      liveTimerStatus.textContent = `Temps écoulé · ${endedLabel}`;
      return;
    }

    liveTimerStatus.textContent = 'Timer en pause.';
    return;
  }

  const activeLabel = activeParticipant === 1 ? timer.participant1Label : timer.participant2Label;
  liveTimerStatus.textContent = `Timer en cours · ${activeLabel} actif`;
}

function renderLiveWinnerControls() {
  if (!liveWinnerParticipant1Btn || !liveWinnerParticipant2Btn) {
    return;
  }

  const { current } = getCurrentOverlayMeta();
  if (!current) {
    liveWinnerParticipant1Btn.disabled = true;
    liveWinnerParticipant2Btn.disabled = true;
    return;
  }

  const leftLabel = sanitizeTimerLabel(current.left?.pseudo, DEFAULT_TIMER_LABEL_1);
  const rightLabel = sanitizeTimerLabel(current.right?.pseudo, DEFAULT_TIMER_LABEL_2);
  liveWinnerParticipant1Btn.textContent = leftLabel;
  liveWinnerParticipant2Btn.textContent = rightLabel;

  const isPlayable = canPlayMatch(current, current.roundIndex);
  liveWinnerParticipant1Btn.disabled = !isPlayable;
  liveWinnerParticipant2Btn.disabled = !isPlayable;
}

function setKeybindingStatus(message, tone = 'info') {
  if (!keybindingStatus) {
    return;
  }

  keybindingStatus.textContent = message;
  keybindingStatus.style.color = tone === 'warning' ? '#ffb26a' : '#9fc7ff';
}

function renderKeybindingsUi() {
  if (!keybindingManager) {
    return;
  }

  const bindings = keybindingManager.getBindings();
  for (const [action, refs] of Object.entries(KEYBINDING_UI)) {
    if (refs.display) {
      refs.display.textContent = formatBinding(bindings[action]);
    }
    if (refs.button) {
      const isCapturing = keybindingManager.captureAction === action;
      refs.button.textContent = isCapturing ? 'Annuler' : 'Binder';
      refs.button.classList.toggle('secondary', isCapturing);
      refs.button.closest('.keybinding-row')?.classList.toggle('is-capturing', isCapturing);
    }
  }
}

function handleTimerKeybindingAction(action) {
  if (action === 'start') {
    const selected = Number(timerStartParticipantSelect?.value || 1);
    return startTimer(selected);
  }
  if (action === 'stop') {
    return stopTimer();
  }
  if (action === 'switch') {
    return switchTimer();
  }
  if (action === 'nextMatch') {
    return shiftOverlayMatch(1);
  }
  if (action === 'winParticipant1') {
    return setCurrentMatchWinner('left');
  }
  if (action === 'winParticipant2') {
    return setCurrentMatchWinner('right');
  }
  return Promise.resolve();
}

function bindCaptureButton(action) {
  const target = KEYBINDING_UI[action]?.button;
  if (!target) {
    return;
  }

  target.addEventListener('click', () => {
    if (!keybindingManager) {
      return;
    }

    if (keybindingManager.captureAction === action) {
      keybindingManager.cancelCapture();
      setKeybindingStatus('Capture annulée.');
      renderKeybindingsUi();
      return;
    }

    keybindingManager.beginCapture(action);
    setKeybindingStatus(
      `En attente d’un input pour “${KEYBINDING_ACTION_LABELS[action]}”. Appuie sur une touche ou clique souris.`
    );
    renderKeybindingsUi();
  });
}

function normalizeUsers(snapshotValue) {
  if (!snapshotValue || typeof snapshotValue !== 'object') {
    return [];
  }

  return Object.entries(snapshotValue)
    .filter(([, user]) => user && typeof user === 'object')
    .map(([id, user]) => ({
      id,
      ...user,
    }));
}

function normalizeParticipants(snapshotValue) {
  if (!snapshotValue || typeof snapshotValue !== 'object') {
    return [];
  }

  return Object.entries(snapshotValue)
    .filter(([, participant]) => participant && typeof participant === 'object')
    .map(([id, participant]) => ({
      ...participant,
      id,
    }));
}

function getParticipantById(participantId) {
  const id = String(participantId || '').trim();
  if (!id) return null;
  return participantsCache.find((participant) => String(participant.id || '').trim() === id) || null;
}

function resolveMatchPlayer(playerRef) {
  if (!playerRef || typeof playerRef !== 'object') return null;
  return getParticipantById(playerRef.id);
}

function resolveParticipantImagePresetPath(rawImage) {
  const raw = String(rawImage || '').trim();
  if (!raw) {
    return '';
  }

  try {
    return new URL(raw, window.location.origin).pathname;
  } catch {
    return '';
  }
}

function syncParticipantImagePresetFromInput() {
  if (!participantImagePresetSelect || !participantImageInput) {
    return;
  }

  const presetPath = resolveParticipantImagePresetPath(participantImageInput.value);
  participantImagePresetSelect.value = participantImagePresetPaths.includes(presetPath) ? presetPath : '';
}

function renderParticipantImagePresetOptions() {
  if (!participantImagePresetSelect) {
    return;
  }

  participantImagePresetSelect.innerHTML = '<option value="">Aucune (je garde une URL manuelle)</option>';
  participantImagePresetPaths.forEach((imagePath) => {
    const option = document.createElement('option');
    option.value = imagePath;
    option.textContent = imagePath.split('/').pop() || imagePath;
    participantImagePresetSelect.appendChild(option);
  });
}

async function loadParticipantImagePresets() {
  if (!participantImagePresetSelect) {
    return;
  }

  try {
    const snapshot = await get(activeProductRefs.participantImagesRef);
    const payload = snapshot.exists() ? snapshot.val() : [];

    const rawEntries = Array.isArray(payload)
      ? payload
      : payload && typeof payload === 'object'
        ? Object.values(payload)
        : [];

    participantImagePresetPaths = rawEntries
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry.trim();
        }
        if (entry && typeof entry === 'object') {
          const candidate = entry.path || entry.url || entry.name || '';
          return String(candidate).trim();
        }
        return '';
      })
      .filter(Boolean)
      .map((entry) => {
        if (/^https?:\/\//i.test(entry)) {
          return entry;
        }
        return entry.startsWith('/') ? entry : `/image_participants/${entry}`;
      });
    renderParticipantImagePresetOptions();
    syncParticipantImagePresetFromInput();
  } catch (error) {
    console.error('Impossible de charger la liste des images depuis Firebase', error);
    participantImagePresetPaths = [];
    participantImagePresetSelect.innerHTML =
      '<option value="">Images Firebase introuvables (utilise le champ URL)</option>';
  }
}

function findUserByUsername(username) {
  const normalized = username.toLowerCase();
  return usersCache.find((user) => String(user.username || '').toLowerCase() === normalized);
}

function getCurrentOverlayMeta() {
  const flatMatches = getOverlayMatches(tournamentCache);
  const safeIndex = Math.max(0, Math.min(currentOverlay.matchIndex || 0, Math.max(flatMatches.length - 1, 0)));
  return {
    flatMatches,
    safeIndex,
    current: flatMatches[safeIndex] || null,
  };
}

function toggleEditMode(participant = null) {
  const editing = Boolean(participant);
  participantFormTitle.textContent = editing ? 'Modifier un participant' : 'Ajouter un participant';
  participantSubmitBtn.textContent = editing ? 'Mettre à jour' : 'Ajouter';
  cancelEditBtn.classList.toggle('hidden', !editing);

  if (!editing) {
    participantForm.reset();
    editParticipantIdField.value = '';
    return;
  }

  editParticipantIdField.value = participant.id;
  participantForm.pseudo.value = participant.pseudo || '';
  participantForm.character.value = participant.character || '';
  participantForm.image.value = participant.image || '';
  syncParticipantImagePresetFromInput();
}

function renderParticipants() {
  participantsList.innerHTML = '';

  if (!participantsCache.length) {
    participantsList.innerHTML = '<li>Aucun participant pour le moment.</li>';
    return;
  }

  participantsCache.forEach((participant, index) => {
    const li = document.createElement('li');
    const safePseudo = escapeHtml(participant.pseudo || '');
    const safeCharacter = escapeHtml(participant.character || '');

    li.innerHTML = `
      <div class="participant-inline">
        <img src="${normalizeImageUrl(participant.image, 'https://placehold.co/72x72?text=?')}" alt="${safePseudo}" />
        <div>
          <strong>${index + 1}. ${safePseudo}</strong><br />
          <span>${safeCharacter}</span>
        </div>
      </div>
      <div class="actions row-inline">
        <button class="secondary ghost" type="button" data-edit-id="${participant.id}">Modifier</button>
        <button class="danger" type="button" data-delete-id="${participant.id}">Supprimer</button>
      </div>
    `;
    participantsList.appendChild(li);
  });
}

function renderBracketContent(targetContainer) {
  if (!targetContainer) {
    return;
  }

  targetContainer.innerHTML = '';

  if (!tournamentCache?.rounds?.length) {
    targetContainer.innerHTML = '<p>Pas de bracket généré.</p>';
    return;
  }

  const { flatMatches, safeIndex, current } = getCurrentOverlayMeta();

  tournamentCache.rounds.forEach((round, roundIndex) => {
    const roundCol = document.createElement('section');
    roundCol.className = 'round';
    roundCol.style.setProperty('--round-index', String(roundIndex));

    const title = getRoundTitle(roundIndex, tournamentCache.rounds.length);
    roundCol.innerHTML = `<h4>${title}</h4>`;

    round.forEach((match, matchIndex) => {
      const node = document.createElement('article');
      node.className = 'match';

      const isPlayable = canPlayMatch(match, roundIndex);
      const overlayIndex = flatMatches.findIndex(
        (entry) => entry.roundIndex === roundIndex && entry.matchIndex === matchIndex,
      );

      if (overlayIndex !== -1 && overlayIndex === safeIndex) {
        node.classList.add('active');
      }

      const winner = computeWinner(match);
      const leftPlayer = resolveMatchPlayer(match.left);
      const rightPlayer = resolveMatchPlayer(match.right);
      const leftName = escapeHtml(leftPlayer?.pseudo || 'En attente');
      const rightName = escapeHtml(rightPlayer?.pseudo || 'En attente');
      const leftCharacter = escapeHtml(leftPlayer?.character || '—');
      const rightCharacter = escapeHtml(rightPlayer?.character || '—');

      node.innerHTML = `
        <button type="button" class="slot ${winner.side === 'left' ? 'is-winner' : ''}" data-side="left">
          <span class="slot-name">${leftName}</span>
          <span class="slot-character">${leftCharacter}</span>
        </button>
        <div class="vs">VS</div>
        <button type="button" class="slot ${winner.side === 'right' ? 'is-winner' : ''}" data-side="right">
          <span class="slot-name">${rightName}</span>
          <span class="slot-character">${rightCharacter}</span>
        </button>
        <button type="button" class="ghost select-overlay" data-overlay-index="${overlayIndex}">Duel</button>
      `;

      const [leftBtn, rightBtn] = node.querySelectorAll('.slot');
      const overlayBtn = node.querySelector('.select-overlay');

      if (!isPlayable) {
        leftBtn.disabled = true;
        rightBtn.disabled = true;
      }

      leftBtn.addEventListener('click', () => setWinner(roundIndex, matchIndex, 'left'));
      rightBtn.addEventListener('click', () => setWinner(roundIndex, matchIndex, 'right'));

      if (overlayBtn) {
        if (!isPlayable || overlayIndex === -1) {
          overlayBtn.disabled = true;
          overlayBtn.textContent = 'Pas prêt';
        } else {
          overlayBtn.textContent = 'Duel';
          overlayBtn.addEventListener('click', () => setOverlayMatch(overlayIndex));
        }
      }

      roundCol.appendChild(node);
    });

    targetContainer.appendChild(roundCol);
  });

  if (tournamentCache.champion?.pseudo) {
    const championNode = document.createElement('div');
    championNode.className = 'champion-banner';
    championNode.innerHTML = `🏆 Vainqueur: <strong>${escapeHtml(tournamentCache.champion.pseudo)}</strong> (${escapeHtml(
      tournamentCache.champion.character || '—',
    )})`;
    targetContainer.appendChild(championNode);
  } else if (current) {
    const helpNode = document.createElement('p');
    helpNode.className = 'hint';
    helpNode.textContent = 'Clique sur un joueur dans chaque match pour le faire avancer.';
    targetContainer.appendChild(helpNode);
  }
}

function renderBracket() {
  renderBracketContent(bracketContainer);
  renderBracketContent(liveBracketContainer);
}

async function setOverlayMatch(index) {
  const { flatMatches } = getCurrentOverlayMeta();
  if (!flatMatches.length) {
    return;
  }

  const clamped = Math.max(0, Math.min(index, flatMatches.length - 1));
  const now = Date.now();
  const payload = {
    matchIndex: clamped,
    updatedAt: now,
  };

  if (clamped !== Number(currentOverlay.matchIndex || 0)) {
    payload.timer = resetTimerState(currentOverlay.timer, now, getTimerParticipantLabels());
  }

  await update(activeProductRefs.overlayRef, payload);
}

async function shiftOverlayMatch(delta) {
  const { safeIndex, flatMatches } = getCurrentOverlayMeta();
  if (!flatMatches.length) {
    return;
  }

  await setOverlayMatch(safeIndex + delta);
}

async function setOverlayImageHeight(heightPx) {
  const safeHeight = sanitizeDuelImageHeight(heightPx);

  await update(activeProductRefs.overlayRef, {
    imageHeightPx: safeHeight,
    updatedAt: Date.now(),
  });
}

async function setOverlayImageOffsetX(offsetXPx) {
  const safeOffset = sanitizeDuelImageOffsetX(offsetXPx);

  await update(activeProductRefs.overlayRef, {
    imageOffsetXPx: safeOffset,
    updatedAt: Date.now(),
  });
}

async function setOverlayImageOffsetY(offsetYPx) {
  const safeOffset = sanitizeDuelImageOffsetY(offsetYPx);

  await update(activeProductRefs.overlayRef, {
    imageOffsetYPx: safeOffset,
    updatedAt: Date.now(),
  });
}

async function setOverlayTextColor(textColor) {
  const safeColor = sanitizeTextColor(textColor);

  await update(activeProductRefs.overlayRef, {
    textColor: safeColor,
    updatedAt: Date.now(),
  });
}

async function setOverlayTextAppearance(patch) {
  const currentTimerTextColor = sanitizeColor(currentOverlay.timerTextColor, DEFAULT_DUEL_TIMER_TEXT_COLOR);
  const currentTimerLabelColor = sanitizeColor(currentOverlay.timerLabelColor, DEFAULT_DUEL_TIMER_LABEL_COLOR);
  const currentCharacterNameColor = sanitizeColor(currentOverlay.characterNameColor, DEFAULT_DUEL_CHARACTER_NAME_COLOR);
  const currentFighterPseudoColor = sanitizeColor(currentOverlay.fighterPseudoColor, DEFAULT_DUEL_FIGHTER_PSEUDO_COLOR);
  const nextShadow = normalizeDuelTextShadow({
    ...currentOverlay.textShadow,
    ...patch.textShadow,
  });
  const nextFontSizes = normalizeDuelFontSizes({
    ...currentOverlay.fontSizes,
    ...patch.fontSizes,
  });

  await update(activeProductRefs.overlayRef, {
    timerTextColor: sanitizeColor(patch.timerTextColor, currentTimerTextColor),
    timerLabelColor: sanitizeColor(patch.timerLabelColor, currentTimerLabelColor),
    characterNameColor: sanitizeColor(patch.characterNameColor, currentCharacterNameColor),
    fighterPseudoColor: sanitizeColor(patch.fighterPseudoColor, currentFighterPseudoColor),
    textShadow: nextShadow,
    fontSizes: nextFontSizes,
    updatedAt: Date.now(),
  });
}

async function setOverlayTimerOffsetY(timerOffsetYPx) {
  const safeOffset = sanitizeDuelTimerOffsetY(timerOffsetYPx);

  await update(activeProductRefs.overlayRef, {
    timerOffsetYPx: safeOffset,
    updatedAt: Date.now(),
  });
}

async function setOverlayTimer(timer) {
  const normalizedTimer = normalizeTimerState(timer);
  await update(activeProductRefs.overlayRef, {
    timerProfile: normalizedTimer.profile,
    timer: normalizedTimer,
    updatedAt: Date.now(),
  });
}

function getTimerParticipantLabels() {
  const { current } = getCurrentOverlayMeta();
  return {
    participant1Label: sanitizeTimerLabel(current?.left?.pseudo, DEFAULT_TIMER_LABEL_1),
    participant2Label: sanitizeTimerLabel(current?.right?.pseudo, DEFAULT_TIMER_LABEL_2),
  };
}

async function syncTimerParticipantLabels() {
  const timer = getResolvedCurrentTimer();
  const labels = getTimerParticipantLabels();
  if (timer.participant1Label === labels.participant1Label && timer.participant2Label === labels.participant2Label) {
    return;
  }

  await setOverlayTimer({
    ...timer,
    participant1Label: labels.participant1Label,
    participant2Label: labels.participant2Label,
  });
}

async function setTimerInitialSeconds(initialSeconds) {
  const safeInitialSeconds = sanitizeTimerInitialSeconds(initialSeconds);
  const baseTimer = normalizeTimerState(getResolvedCurrentTimer());
  baseTimer.initialSeconds = safeInitialSeconds;
  await setOverlayTimer(resetTimerState(baseTimer, Date.now()));
}

async function setTimerProfile(profile) {
  const safeProfile = sanitizeTimerProfile(profile);
  const nextTimer = getResolvedCurrentTimer();
  nextTimer.profile = safeProfile;
  await setOverlayTimer(nextTimer);
}

async function setTimerHealthConfig(partialConfig) {
  const nextTimer = getResolvedCurrentTimer();
  nextTimer.healthConfig = normalizeTimerHealthConfig({
    ...nextTimer.healthConfig,
    ...partialConfig,
  });
  await setOverlayTimer(nextTimer);
}

async function startTimer(participant) {
  const now = Date.now();
  const timer = startTimerForParticipant(currentOverlay.timer, participant, now);
  await setOverlayTimer(timer);
}

async function stopTimer() {
  const timer = stopTimerState(currentOverlay.timer, Date.now());
  await setOverlayTimer(timer);
}

async function switchTimer() {
  const timer = switchTimerParticipant(currentOverlay.timer, Date.now());
  await setOverlayTimer(timer);
}

async function generateMatches() {
  if (participantsCache.length < 2) {
    alert('Ajoute au moins 2 participants.');
    return;
  }

  if (participantsCache.length > BRACKET_SIZE) {
    alert(`Maximum ${BRACKET_SIZE} participants pour ce tournoi.`);
    return;
  }

  const shouldShuffle = bracketSeedingModeSelect?.value !== 'manual';
  const tournament = createTournament(participantsCache, BRACKET_SIZE, { shuffle: shouldShuffle });
  await set(activeProductRefs.matchesRef, tournament);
  await setOverlayMatch(0);
}

function rebuildTournamentParticipants(tournament, updatedParticipant) {
  if (!tournament || !Array.isArray(tournament.participants) || !updatedParticipant?.id) {
    return null;
  }

  let changed = false;
  const nextParticipants = tournament.participants.map((entry) => {
    if (String(entry?.id || '').trim() !== updatedParticipant.id) {
      return entry;
    }

    changed = true;
    return {
      ...entry,
      pseudo: updatedParticipant.pseudo,
      character: updatedParticipant.character,
      image: updatedParticipant.image,
    };
  });

  if (!changed) {
    return null;
  }

  return {
    ...tournament,
    participants: nextParticipants,
    updatedAt: Date.now(),
  };
}

async function setWinner(roundIndex, matchIndex, side) {
  if (!tournamentCache?.rounds?.[roundIndex]?.[matchIndex]) {
    return;
  }

  const rebuilt = updateMatchWinner(tournamentCache, roundIndex, matchIndex, side);
  if (!rebuilt) {
    return;
  }

  await set(activeProductRefs.matchesRef, rebuilt);
}

async function setCurrentMatchWinner(side) {
  const { current } = getCurrentOverlayMeta();
  if (!current) {
    return;
  }

  await setWinner(current.roundIndex, current.matchIndex, side);
}

function openDuelOverlayWindow() {
  const params = new URLSearchParams({
    product: activeProductRefs.productKey,
  });
  if (activeProfileId) {
    params.set('profile', activeProfileId);
  }
  window.open(`overlays/duel-overlay.html?${params.toString()}`, '_blank', 'width=1600,height=900');
}

function openTreeOverlayWindow() {
  const params = new URLSearchParams({
    product: activeProductRefs.productKey,
  });
  if (activeProfileId) {
    params.set('profile', activeProfileId);
  }
  window.open(`overlays/tree-overlay.html?${params.toString()}`, '_blank', 'width=1600,height=900');
}

async function login(username, password) {
  if (!username || !password) {
    return false;
  }

  let user = findUserByUsername(username);

  // Le cache peut être en retard juste après la création d'un compte.
  // On force un refresh pour éviter les faux "Identifiants invalides".
  if (!user) {
    await refreshUsersCache();
    user = findUserByUsername(username);
  }

  if (!user || user.password !== password) {
    return false;
  }

  await set(authRefs.profileRef, {
    uid: user.id,
    username: user.username,
    loggedAt: Date.now(),
  });

  return true;
}

async function createProfile(username, password) {
  if (!username || !password) {
    return { ok: false, message: 'Identifiant et mot de passe obligatoires.' };
  }

  if (!USERNAME_REGEX.test(username)) {
    return {
      ok: false,
      message: 'Identifiant invalide (3-24 caractères: lettres, chiffres, _ ou -).',
    };
  }

  if (password.length < 6) {
    return { ok: false, message: 'Mot de passe trop court (6 caractères minimum).' };
  }

  if (findUserByUsername(username)) {
    return { ok: false, message: 'Ce nom de compte existe déjà.' };
  }

  if (usersCache.length >= MAX_ACCOUNTS) {
    return { ok: false, message: 'Limite atteinte : 2 comptes maximum.' };
  }

  const userRef = push(authRefs.usersRef);
  const uid = userRef.key;

  if (!uid) {
    return { ok: false, message: 'Erreur interne: uid utilisateur introuvable.' };
  }

  const now = Date.now();

  await set(userRef, {
    username,
    password,
    createdAt: now,
  });

  usersCache = [
    ...usersCache,
    {
      id: uid,
      username,
      password,
      createdAt: now,
    },
  ];
  usersLoaded = true;

  return { ok: true, message: 'Compte créé. Tu peux te connecter.' };
}

async function logout() {
  await set(authRefs.profileRef, null);
  activeProfileId = null;
  await update(activeProductRefs.overlayRef, {
    matchIndex: 0,
    updatedAt: Date.now(),
  });
}

function showLogin() {
  loginSection.classList.remove('hidden');
  appSection.classList.add('hidden');
}

function showApp() {
  loginSection.classList.add('hidden');
  appSection.classList.remove('hidden');
  renderActiveView(parseViewFromHash());
  renderParticipants();
  renderBracket();
  renderLiveTimerPanel();
}

function renderConnectionStatus() {
  if (!connectionStatus) {
    return;
  }

  if (isConnected) {
    connectionStatus.textContent = '✅ Connecté à la base de données.';
    return;
  }

  connectionStatus.textContent = '⚠️ Connexion à la base perdue. Vérifie Internet/Firebase puis réessaie.';
}

async function refreshUsersCache() {
  const snapshot = await get(authRefs.usersRef);
  usersCache = normalizeUsers(snapshot.val() || {});
  usersLoaded = true;
}

async function ensureDatabaseShape() {
  const legacySnapshot = await get(legacyRootRef);
  const legacyValue = legacySnapshot.val() || {};

  const authSnapshot = await get(authRefs.authRootRef);
  const authValue = authSnapshot.val() || {};

  if ((!authValue.users || typeof authValue.users !== 'object') && legacyValue.users && typeof legacyValue.users === 'object') {
    await set(authRefs.usersRef, legacyValue.users);
  }
  if (!authValue.users || typeof authValue.users !== 'object') {
    await set(authRefs.usersRef, {});
  }
  if (authValue.profile === undefined && legacyValue.profile !== undefined) {
    await set(authRefs.profileRef, legacyValue.profile ?? null);
  }
  if (authValue.profile === undefined) {
    await set(authRefs.profileRef, null);
  }

  const snapshot = await get(activeProductRefs.productRootRef);
  const value = snapshot.val() || {};

  if (
    (!value.participants || typeof value.participants !== 'object') &&
    legacyValue.participants &&
    typeof legacyValue.participants === 'object'
  ) {
    await set(activeProductRefs.participantsRef, legacyValue.participants);
  }

  if (!value.matches && legacyValue.matches !== undefined) {
    await set(activeProductRefs.matchesRef, legacyValue.matches ?? null);
  }

  if ((!value.overlay || typeof value.overlay !== 'object') && legacyValue.overlay && typeof legacyValue.overlay === 'object') {
    await set(activeProductRefs.overlayRef, legacyValue.overlay);
  }

  if (
    (!value.participantImages || typeof value.participantImages !== 'object') &&
    legacyValue.participantImages &&
    typeof legacyValue.participantImages === 'object'
  ) {
    await set(activeProductRefs.participantImagesRef, legacyValue.participantImages);
  }

  if (!value.participants || typeof value.participants !== 'object') {
    await set(activeProductRefs.participantsRef, {});
  }

  if (!value.matches) {
    await set(activeProductRefs.matchesRef, null);
  }

  if (!value.overlay || typeof value.overlay !== 'object') {
    await set(activeProductRefs.overlayRef, {
      matchIndex: 0,
      imageHeightPx: DEFAULT_DUEL_IMAGE_HEIGHT_PX,
      imageOffsetXPx: DEFAULT_DUEL_IMAGE_OFFSET_X_PX,
      imageOffsetYPx: DEFAULT_DUEL_IMAGE_OFFSET_Y_PX,
      textColor: DEFAULT_DUEL_TEXT_COLOR,
      timerTextColor: DEFAULT_DUEL_TIMER_TEXT_COLOR,
      timerLabelColor: DEFAULT_DUEL_TIMER_LABEL_COLOR,
      characterNameColor: DEFAULT_DUEL_CHARACTER_NAME_COLOR,
      fighterPseudoColor: DEFAULT_DUEL_FIGHTER_PSEUDO_COLOR,
      textShadow: DEFAULT_DUEL_TEXT_SHADOW,
      fontSizes: DEFAULT_DUEL_FONT_SIZES,
                  timerOffsetYPx: DEFAULT_DUEL_TIMER_OFFSET_Y_PX,
      timerProfile: DEFAULT_TIMER_PROFILE,
      timer: normalizeTimerState({
        initialSeconds: DEFAULT_TIMER_INITIAL_SECONDS,
        profile: DEFAULT_TIMER_PROFILE,
        healthConfig: DEFAULT_TIMER_HEALTH_CONFIG,
      }),
      updatedAt: Date.now(),
    });
  } else {
    const patches = {};

    if (!Number.isFinite(Number(value.overlay.imageHeightPx))) {
      patches.imageHeightPx = DEFAULT_DUEL_IMAGE_HEIGHT_PX;
    }

    if (!Number.isFinite(Number(value.overlay.imageOffsetXPx))) {
      patches.imageOffsetXPx = DEFAULT_DUEL_IMAGE_OFFSET_X_PX;
    }

    if (!Number.isFinite(Number(value.overlay.imageOffsetYPx))) {
      patches.imageOffsetYPx = DEFAULT_DUEL_IMAGE_OFFSET_Y_PX;
    }

    if (!/^#[0-9a-fA-F]{6}$/.test(String(value.overlay.textColor || '').trim())) {
      patches.textColor = DEFAULT_DUEL_TEXT_COLOR;
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(String(value.overlay.timerTextColor || '').trim())) {
      patches.timerTextColor = DEFAULT_DUEL_TIMER_TEXT_COLOR;
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(String(value.overlay.timerLabelColor || '').trim())) {
      patches.timerLabelColor = DEFAULT_DUEL_TIMER_LABEL_COLOR;
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(String(value.overlay.characterNameColor || '').trim())) {
      patches.characterNameColor = DEFAULT_DUEL_CHARACTER_NAME_COLOR;
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(String(value.overlay.fighterPseudoColor || '').trim())) {
      patches.fighterPseudoColor = DEFAULT_DUEL_FIGHTER_PSEUDO_COLOR;
    }
    if (!value.overlay.textShadow || typeof value.overlay.textShadow !== 'object') {
      patches.textShadow = DEFAULT_DUEL_TEXT_SHADOW;
    }
    if (!value.overlay.fontSizes || typeof value.overlay.fontSizes !== 'object') {
      patches.fontSizes = DEFAULT_DUEL_FONT_SIZES;
    }

    if (!Number.isFinite(Number(value.overlay.timerOffsetYPx))) {
      patches.timerOffsetYPx = DEFAULT_DUEL_TIMER_OFFSET_Y_PX;
    }

    if (!value.overlay.timer || typeof value.overlay.timer !== 'object') {
      patches.timer = normalizeTimerState({
        initialSeconds: DEFAULT_TIMER_INITIAL_SECONDS,
        profile: DEFAULT_TIMER_PROFILE,
        healthConfig: DEFAULT_TIMER_HEALTH_CONFIG,
      });
    }
    if (!value.overlay.timerProfile) {
      const timerProfile = sanitizeTimerProfile(value.overlay.timer?.profile);
      patches.timerProfile = timerProfile;
    }

    if (Object.keys(patches).length) {
      patches.updatedAt = Date.now();
      await update(activeProductRefs.overlayRef, patches);
    }
  }

}

function bindRealtimeSubscriptions() {
  onValue(connectedRef, (snapshot) => {
    isConnected = snapshot.val() === true;
    renderConnectionStatus();
  });

  onValue(authRefs.usersRef, async (snapshot) => {
    const usersMap = snapshot.val() || {};
    usersCache = normalizeUsers(usersMap);
    usersLoaded = true;

    if (currentProfile?.uid && !usersMap[currentProfile.uid]) {
      await logout();
    }
  });

  onValue(authRefs.profileRef, (snapshot) => {
    currentProfile = snapshot.val();
    const currentUid = String(currentProfile?.uid || '').trim() || null;
    const currentUrl = new URL(window.location.href);
    const expectedRefs = getProductRefsBySlug(activeProductSlug || DEFAULT_PRODUCT_KEY, currentUid);
    const currentPath = String(activeProductRefs.productRootRef.toString());
    const expectedPath = String(expectedRefs.productRootRef.toString());

    if (currentPath !== expectedPath) {
      currentUrl.searchParams.set('product', expectedRefs.productKey);
      if (currentUid) {
        currentUrl.searchParams.set('profile', currentUid);
      } else {
        currentUrl.searchParams.delete('profile');
      }
      window.location.href = currentUrl.toString();
      return;
    }

    if (currentProfile?.username) {
      showApp();
      return;
    }

    showLogin();
  });

  onValue(activeProductRefs.participantsRef, (snapshot) => {
    participantsCache = normalizeParticipants(snapshot.val());
    renderParticipants();
  });

  onValue(activeProductRefs.matchesRef, (snapshot) => {
    tournamentCache = normalizeTournament(snapshot.val());
    renderBracket();
    renderLiveWinnerControls();
    syncTimerParticipantLabels();
  });

  onValue(activeProductRefs.overlayRef, (snapshot) => {
    const value = snapshot.val() || {};
    const normalizedTimer = normalizeTimerState({
      ...value.timer,
      profile: value.timerProfile ?? value.timer?.profile,
    });
    currentOverlay = {
      matchIndex: Number(value.matchIndex || 0),
      imageHeightPx: sanitizeDuelImageHeight(value.imageHeightPx),
      imageOffsetXPx: sanitizeDuelImageOffsetX(value.imageOffsetXPx),
      imageOffsetYPx: sanitizeDuelImageOffsetY(value.imageOffsetYPx),
      textColor: sanitizeTextColor(value.textColor),
      timerTextColor: sanitizeColor(value.timerTextColor, DEFAULT_DUEL_TIMER_TEXT_COLOR),
      timerLabelColor: sanitizeColor(value.timerLabelColor, DEFAULT_DUEL_TIMER_LABEL_COLOR),
      characterNameColor: sanitizeColor(value.characterNameColor, DEFAULT_DUEL_CHARACTER_NAME_COLOR),
      fighterPseudoColor: sanitizeColor(value.fighterPseudoColor, DEFAULT_DUEL_FIGHTER_PSEUDO_COLOR),
      textShadow: normalizeDuelTextShadow(value.textShadow),
      fontSizes: normalizeDuelFontSizes(value.fontSizes),
      timerOffsetYPx: sanitizeDuelTimerOffsetY(value.timerOffsetYPx),
      timerProfile: normalizedTimer.profile,
      timer: normalizedTimer,
    };

    if (duelImageHeightInput) {
      duelImageHeightInput.value = String(currentOverlay.imageHeightPx);
    }
    if (duelImageOffsetXInput) {
      duelImageOffsetXInput.value = String(currentOverlay.imageOffsetXPx);
    }
    if (duelImageOffsetYInput) {
      duelImageOffsetYInput.value = String(currentOverlay.imageOffsetYPx);
    }
    if (duelTextColorInput) {
      duelTextColorInput.value = currentOverlay.textColor;
    }
    if (duelTimerTextColorInput) {
      duelTimerTextColorInput.value = currentOverlay.timerTextColor;
    }
    if (duelTimerLabelColorInput) {
      duelTimerLabelColorInput.value = currentOverlay.timerLabelColor;
    }
    if (duelCharacterNameColorInput) {
      duelCharacterNameColorInput.value = currentOverlay.characterNameColor;
    }
    if (duelFighterPseudoColorInput) {
      duelFighterPseudoColorInput.value = currentOverlay.fighterPseudoColor;
    }
    if (duelTextShadowEnabledInput) {
      duelTextShadowEnabledInput.checked = currentOverlay.textShadow.enabled;
    }
    if (duelTextShadowColorInput) {
      duelTextShadowColorInput.value = currentOverlay.textShadow.color;
    }
    if (duelTextShadowBlurInput) {
      duelTextShadowBlurInput.value = String(currentOverlay.textShadow.blurPx);
    }
    if (duelTextShadowOffsetXInput) {
      duelTextShadowOffsetXInput.value = String(currentOverlay.textShadow.offsetXPx);
    }
    if (duelTextShadowOffsetYInput) {
      duelTextShadowOffsetYInput.value = String(currentOverlay.textShadow.offsetYPx);
    }
    if (duelTimerValueFontSizeInput) {
      duelTimerValueFontSizeInput.value = String(currentOverlay.fontSizes.timerValuePx);
    }
    if (duelTimerLabelFontSizeInput) {
      duelTimerLabelFontSizeInput.value = String(currentOverlay.fontSizes.timerLabelPx);
    }
    if (duelCharacterFontSizeInput) {
      duelCharacterFontSizeInput.value = String(currentOverlay.fontSizes.characterNamePx);
    }
    if (duelFighterPseudoFontSizeInput) {
      duelFighterPseudoFontSizeInput.value = String(currentOverlay.fontSizes.fighterPseudoPx);
    }
    if (liveTimerInitialSecondsInput) {
      liveTimerInitialSecondsInput.value = String(currentOverlay.timer.initialSeconds);
    }
    if (duelTimerProfileSelect) {
      duelTimerProfileSelect.value = currentOverlay.timerProfile;
    }
    if (duelTimerOffsetYInput) {
      duelTimerOffsetYInput.value = String(currentOverlay.timerOffsetYPx);
    }
    if (duelHealthBarsEnabledInput) {
      duelHealthBarsEnabledInput.checked = currentOverlay.timer.healthConfig.enabled;
    }
    if (duelHealthBarHeightInput) {
      duelHealthBarHeightInput.value = String(currentOverlay.timer.healthConfig.barHeightPx);
    }
    if (duelHealthBarWidthInput) {
      duelHealthBarWidthInput.value = String(currentOverlay.timer.healthConfig.barWidthPercent);
    }
    if (duelHealthMainColorInput) {
      duelHealthMainColorInput.value = currentOverlay.timer.healthConfig.mainColor;
    }
    if (duelHealthWarningColorInput) {
      duelHealthWarningColorInput.value = currentOverlay.timer.healthConfig.warningColor;
    }
    if (duelHealthDangerColorInput) {
      duelHealthDangerColorInput.value = currentOverlay.timer.healthConfig.dangerColor;
    }
    if (duelHealthAnimationIntensityInput) {
      duelHealthAnimationIntensityInput.value = String(currentOverlay.timer.healthConfig.animationIntensity);
    }
    if (duelHealthDangerEffectsInput) {
      duelHealthDangerEffectsInput.checked = currentOverlay.timer.healthConfig.dangerEffects;
    }
    if (timerStartParticipantSelect?.options?.[0]) {
      timerStartParticipantSelect.options[0].textContent = currentOverlay.timer.participant1Label;
    }
    if (timerStartParticipantSelect?.options?.[1]) {
      timerStartParticipantSelect.options[1].textContent = currentOverlay.timer.participant2Label;
    }
    renderQuizQaRectInputs(normalizeQuizQaRect(value.quizLayout?.questionAnswerRect));

    renderBracket();
    renderLiveTimerPanel();
    renderLiveWinnerControls();
    syncTimerParticipantLabels();
  });

}

window.addEventListener('hashchange', () => {
  renderActiveView(parseViewFromHash());
});

navItems.forEach((item) => {
  item.addEventListener('click', (event) => {
    event.preventDefault();
    const targetView = String(item.dataset.targetView || 'participants');
    if (window.location.hash === `#${targetView}`) {
      renderActiveView(targetView);
      return;
    }
    window.location.hash = targetView;
  });
});

createProfileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(createProfileForm);
  const username = String(formData.get('newUsername') || '').trim();
  const password = String(formData.get('newPassword') || '');

  try {
    if (!usersLoaded) {
      await refreshUsersCache();
    }

    const result = await createProfile(username, password);
    createProfileMessage.textContent = result.message;

    if (result.ok) {
      createProfileForm.reset();
    }
  } catch (error) {
    console.error('Erreur création du compte', error);
    createProfileMessage.textContent = 'Connexion impossible pour le moment. Réessaie dans quelques secondes.';
  }
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const username = String(formData.get('username') || '').trim();
  const password = String(formData.get('password') || '');

  try {
    if (!usersLoaded) {
      await refreshUsersCache();
    }

    if (await login(username, password)) {
      loginMessage.textContent = '';
      loginForm.reset();
      const user = findUserByUsername(username);
      if (user?.id) {
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set('profile', user.id);
        window.location.href = nextUrl.toString();
      }
    } else {
      loginMessage.textContent = 'Identifiants invalides.';
    }
  } catch (error) {
    console.error('Erreur de connexion utilisateur', error);
    loginMessage.textContent = 'Connexion impossible à la base. Vérifie le statut ci-dessus.';
  }
});

participantForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(participantForm);

  const participant = {
    pseudo: String(formData.get('pseudo') || '').trim(),
    character: String(formData.get('character') || '').trim(),
    image: String(formData.get('image') || '').trim(),
  };

  if (!participant.pseudo || !participant.character) {
    participantMessage.textContent = 'Le pseudo et le personnage sont obligatoires.';
    return;
  }

  const editId = String(formData.get('editParticipantId') || '').trim();

  if (editId) {
    await update(child(activeProductRefs.participantsRef, editId), participant);
    const syncedTournament = rebuildTournamentParticipants(tournamentCache, { ...participant, id: editId });
    if (syncedTournament) {
      await set(activeProductRefs.matchesRef, syncedTournament);
    }
    participantMessage.textContent = 'Participant modifié ✅';
    toggleEditMode();
    return;
  }

  const newParticipantRef = push(activeProductRefs.participantsRef);
  await set(newParticipantRef, { ...participant, id: newParticipantRef.key });

  participantMessage.textContent = 'Participant ajouté ✅';
  toggleEditMode();
});

participantImagePresetSelect?.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement) || !participantImageInput) {
    return;
  }

  if (!target.value) {
    return;
  }

  participantImageInput.value = new URL(target.value, window.location.origin).toString();
});

participantImageInput?.addEventListener('input', () => {
  syncParticipantImagePresetFromInput();
});

participantsList.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const deleteButton = target.closest('[data-delete-id]');
  const editButton = target.closest('[data-edit-id]');

  if (editButton) {
    const participantId = editButton.dataset.editId;
    const participant = participantsCache.find((item) => item.id === participantId);
    if (participant) {
      toggleEditMode(participant);
      participantMessage.textContent = `Modification de ${participant.pseudo}`;
    }
    return;
  }

  if (!deleteButton) {
    return;
  }

  const participantId = deleteButton.dataset.deleteId;
  if (!participantId) {
    return;
  }

  const participant = participantsCache.find((item) => item.id === participantId);
  if (!participant) {
    return;
  }

  const confirmed = window.confirm(`Supprimer ${participant.pseudo} ?`);
  if (!confirmed) {
    return;
  }

  const participantRef = child(activeProductRefs.participantsRef, participantId);
  await remove(participantRef);

  participantMessage.textContent = `${participant.pseudo} supprimé ✅`;
});

cancelEditBtn.addEventListener('click', () => {
  toggleEditMode();
  participantMessage.textContent = 'Modification annulée.';
});

clearParticipantsBtn.addEventListener('click', async () => {
  if (!participantsCache.length) {
    return;
  }

  const confirmed = window.confirm('Vider tous les participants et le tournoi ?');
  if (!confirmed) {
    return;
  }

  await set(activeProductRefs.participantsRef, {});
  await set(activeProductRefs.matchesRef, null);
  await setOverlayMatch(0);
  participantMessage.textContent = 'Participants vidés.';
});

generateBracketBtn.addEventListener('click', () => {
  generateMatches();
});

overlayPrevBtn.addEventListener('click', () => shiftOverlayMatch(-1));
overlayNextBtn.addEventListener('click', () => shiftOverlayMatch(1));

duelImageHeightInput?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  const safeHeight = sanitizeDuelImageHeight(target.value);
  target.value = String(safeHeight);
  await setOverlayImageHeight(safeHeight);
});

duelImageOffsetXInput?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  const safeOffset = sanitizeDuelImageOffsetX(target.value);
  target.value = String(safeOffset);
  await setOverlayImageOffsetX(safeOffset);
});

duelImageOffsetYInput?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  const safeOffset = sanitizeDuelImageOffsetY(target.value);
  target.value = String(safeOffset);
  await setOverlayImageOffsetY(safeOffset);
});

duelTextColorInput?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  const safeColor = sanitizeTextColor(target.value);
  target.value = safeColor;
  await setOverlayTextColor(safeColor);
});

duelTimerTextColorInput?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  const safeColor = sanitizeColor(target.value, DEFAULT_DUEL_TIMER_TEXT_COLOR);
  target.value = safeColor;
  await setOverlayTextAppearance({ timerTextColor: safeColor });
});

duelTimerLabelColorInput?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  const safeColor = sanitizeColor(target.value, DEFAULT_DUEL_TIMER_LABEL_COLOR);
  target.value = safeColor;
  await setOverlayTextAppearance({ timerLabelColor: safeColor });
});

duelCharacterNameColorInput?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  const safeColor = sanitizeColor(target.value, DEFAULT_DUEL_CHARACTER_NAME_COLOR);
  target.value = safeColor;
  await setOverlayTextAppearance({ characterNameColor: safeColor });
});

duelFighterPseudoColorInput?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  const safeColor = sanitizeColor(target.value, DEFAULT_DUEL_FIGHTER_PSEUDO_COLOR);
  target.value = safeColor;
  await setOverlayTextAppearance({ fighterPseudoColor: safeColor });
});

duelTextShadowEnabledInput?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  await setOverlayTextAppearance({
    textShadow: { enabled: target.checked },
  });
});

duelTextShadowColorInput?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  const safeColor = sanitizeColor(target.value, DEFAULT_DUEL_TEXT_SHADOW.color);
  target.value = safeColor;
  await setOverlayTextAppearance({
    textShadow: { color: safeColor },
  });
});

duelTextShadowBlurInput?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  const safeValue = sanitizeRange(target.value, DEFAULT_DUEL_TEXT_SHADOW.blurPx, 0, 80);
  target.value = String(safeValue);
  await setOverlayTextAppearance({
    textShadow: { blurPx: safeValue },
  });
});

duelTextShadowOffsetXInput?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  const safeValue = sanitizeRange(target.value, DEFAULT_DUEL_TEXT_SHADOW.offsetXPx, -30, 30);
  target.value = String(safeValue);
  await setOverlayTextAppearance({
    textShadow: { offsetXPx: safeValue },
  });
});

duelTextShadowOffsetYInput?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  const safeValue = sanitizeRange(target.value, DEFAULT_DUEL_TEXT_SHADOW.offsetYPx, -30, 30);
  target.value = String(safeValue);
  await setOverlayTextAppearance({
    textShadow: { offsetYPx: safeValue },
  });
});

duelTimerValueFontSizeInput?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  const safeValue = sanitizeRange(target.value, DEFAULT_DUEL_FONT_SIZES.timerValuePx, 12, 120);
  target.value = String(safeValue);
  await setOverlayTextAppearance({
    fontSizes: { timerValuePx: safeValue },
  });
});

duelTimerLabelFontSizeInput?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  const safeValue = sanitizeRange(target.value, DEFAULT_DUEL_FONT_SIZES.timerLabelPx, 10, 90);
  target.value = String(safeValue);
  await setOverlayTextAppearance({
    fontSizes: { timerLabelPx: safeValue },
  });
});

duelCharacterFontSizeInput?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  const safeValue = sanitizeRange(target.value, DEFAULT_DUEL_FONT_SIZES.characterNamePx, 12, 140);
  target.value = String(safeValue);
  await setOverlayTextAppearance({
    fontSizes: { characterNamePx: safeValue },
  });
});

duelFighterPseudoFontSizeInput?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  const safeValue = sanitizeRange(target.value, DEFAULT_DUEL_FONT_SIZES.fighterPseudoPx, 10, 100);
  target.value = String(safeValue);
  await setOverlayTextAppearance({
    fontSizes: { fighterPseudoPx: safeValue },
  });
});

liveTimerInitialSecondsInput?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  const safeSeconds = sanitizeTimerInitialSeconds(target.value);
  target.value = String(safeSeconds);
  await setTimerInitialSeconds(safeSeconds);
});

duelTimerProfileSelect?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) {
    return;
  }

  const safeProfile = sanitizeTimerProfile(target.value);
  target.value = safeProfile;
  await setTimerProfile(safeProfile);
});

duelTimerOffsetYInput?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  const safeOffset = sanitizeDuelTimerOffsetY(target.value);
  target.value = String(safeOffset);
  await setOverlayTimerOffsetY(safeOffset);
});

duelHealthBarsEnabledInput?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  await setTimerHealthConfig({ enabled: target.checked });
});

duelHealthBarHeightInput?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  const safeValue = sanitizeInteger(target.value, DEFAULT_TIMER_HEALTH_CONFIG.barHeightPx);
  target.value = String(safeValue);
  await setTimerHealthConfig({ barHeightPx: safeValue });
});

duelHealthBarWidthInput?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  const safeValue = sanitizeInteger(target.value, DEFAULT_TIMER_HEALTH_CONFIG.barWidthPercent);
  target.value = String(safeValue);
  await setTimerHealthConfig({ barWidthPercent: safeValue });
});

duelHealthMainColorInput?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  const safeColor = sanitizeHealthColor(target.value, DEFAULT_TIMER_HEALTH_CONFIG.mainColor);
  target.value = safeColor;
  await setTimerHealthConfig({ mainColor: safeColor });
});

duelHealthWarningColorInput?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  const safeColor = sanitizeHealthColor(target.value, DEFAULT_TIMER_HEALTH_CONFIG.warningColor);
  target.value = safeColor;
  await setTimerHealthConfig({ warningColor: safeColor });
});

duelHealthDangerColorInput?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  const safeColor = sanitizeHealthColor(target.value, DEFAULT_TIMER_HEALTH_CONFIG.dangerColor);
  target.value = safeColor;
  await setTimerHealthConfig({ dangerColor: safeColor });
});

duelHealthAnimationIntensityInput?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  const safeValue = sanitizeRange(target.value, DEFAULT_TIMER_HEALTH_CONFIG.animationIntensity, 0, 100);
  target.value = String(safeValue);
  await setTimerHealthConfig({ animationIntensity: safeValue });
});

duelHealthDangerEffectsInput?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  await setTimerHealthConfig({ dangerEffects: target.checked });
});

keybindingManager = createKeybindingManager({
  onAction: async (action) => {
    await handleTimerKeybindingAction(action);
  },
  shouldIgnoreEvent: (event) => {
    if (isTextEntryActive()) {
      return true;
    }

    if (event instanceof MouseEvent && isInteractiveControlTarget(event.target)) {
      return true;
    }

    return false;
  },
});

bindCaptureButton('start');
bindCaptureButton('stop');
bindCaptureButton('switch');
bindCaptureButton('nextMatch');
bindCaptureButton('winParticipant1');
bindCaptureButton('winParticipant2');
renderKeybindingsUi();
setKeybindingStatus('Raccourcis actifs.');

window.addEventListener('zog:keybindings-updated', (event) => {
  const action = event.detail?.action;
  const conflictAction = event.detail?.conflictAction;
  if (conflictAction) {
    setKeybindingStatus(
      `Conflit détecté : “${KEYBINDING_ACTION_LABELS[action]}” remplace le bind de “${KEYBINDING_ACTION_LABELS[conflictAction]}”.`,
      'warning'
    );
  } else {
    setKeybindingStatus(`Bind enregistré pour “${KEYBINDING_ACTION_LABELS[action]}”.`);
  }
  renderKeybindingsUi();
});

window.addEventListener('zog:keybindings-capture-cancelled', () => {
  setKeybindingStatus('Capture annulée.');
  renderKeybindingsUi();
});

resetBindingsBtn?.addEventListener('click', () => {
  if (!keybindingManager) {
    return;
  }
  keybindingManager.resetBindings();
  keybindingManager.cancelCapture();
  renderKeybindingsUi();
  setKeybindingStatus('Bindings réinitialisés par défaut (S / A / D / F / Q / E).');
});

timerStartBtn?.addEventListener('click', async () => {
  const selected = Number(timerStartParticipantSelect?.value || 1);
  await startTimer(selected);
});

timerStopBtn?.addEventListener('click', async () => {
  await stopTimer();
});

timerSwitchBtn?.addEventListener('click', async () => {
  await switchTimer();
});

liveWinnerParticipant1Btn?.addEventListener('click', async () => {
  await setCurrentMatchWinner('left');
});

liveWinnerParticipant2Btn?.addEventListener('click', async () => {
  await setCurrentMatchWinner('right');
});

openDuelOverlayBtn.addEventListener('click', openDuelOverlayWindow);
openTreeOverlayBtn.addEventListener('click', openTreeOverlayWindow);
logoutBtn.addEventListener('click', () => {
  logout();
});


const quizRoundTabs = Array.from(document.querySelectorAll('.quiz-round-tab'));
const quizRoundPanels = Array.from(document.querySelectorAll('[data-quiz-round-panel]'));
const openQuizOverlayBtn = document.getElementById('openQuizOverlayBtn');
const openBuzzerPageBtn = document.getElementById('openBuzzerPageBtn');
const quizQuestionForm = document.getElementById('quizQuestionForm');
const quizQuestionTypeInput = document.getElementById('quizQuestionType');
const quizQuestionTextInput = document.getElementById('quizQuestionText');
const quizQuestionAnswersInput = document.getElementById('quizQuestionAnswers');
const quizQuestionMessage = document.getElementById('quizQuestionMessage');
const quizQuestionsList = document.getElementById('quizQuestionsList');
const quizStreamerForm = document.getElementById('quizStreamerForm');
const quizStreamerNameInput = document.getElementById('quizStreamerName');
const quizStreamerList = document.getElementById('quizStreamerList');
const quizViewerForm = document.getElementById('quizViewerForm');
const quizViewerNameInput = document.getElementById('quizViewerName');
const quizViewerList = document.getElementById('quizViewerList');
const quizGenerateCodeBtn = document.getElementById('quizGenerateCodeBtn');
const quizClearInviteCodesBtn = document.getElementById('quizClearInviteCodesBtn');
const quizInviteCodesList = document.getElementById('quizInviteCodesList');
const quizBuzzerLiveStatus = document.getElementById('quizBuzzerLiveStatus');
const quizResetBuzzBtn = document.getElementById('quizResetBuzzBtn');
const quizCloseQuestionBtn = document.getElementById('quizCloseQuestionBtn');
const quizOpenQuestionBtn = document.getElementById('quizOpenQuestionBtn');
const quizResetRoundBtn = document.getElementById('quizResetRoundBtn');
const quizClearQuestionsBtn = document.getElementById('quizClearQuestionsBtn');
const quizResetStreamerScoresBtn = document.getElementById('quizResetStreamerScoresBtn');
const quizResetViewerScoresBtn = document.getElementById('quizResetViewerScoresBtn');
const quizBuzzParticipantsList = document.getElementById('quizBuzzParticipantsList');
const quizMetricQuestions = document.getElementById('quizMetricQuestions');
const quizMetricStreamers = document.getElementById('quizMetricStreamers');
const quizMetricViewers = document.getElementById('quizMetricViewers');
const quizMetricBuzzer = document.getElementById('quizMetricBuzzer');
const quizQaRectX1Input = document.getElementById('quizQaRectX1');
const quizQaRectY1Input = document.getElementById('quizQaRectY1');
const quizQaRectX2Input = document.getElementById('quizQaRectX2');
const quizQaRectY2Input = document.getElementById('quizQaRectY2');

let quizRound1State = {
  questions: [],
  streamerScores: [],
  viewerScores: [],
  inviteCodes: [],
  buzzerParticipants: [],
  currentBuzz: null,
  questionState: null,
};

function getQuizRound1Refs() {
  const baseRef = ref(activeProductRefs.productRootRef, 'round1');
  return {
    questionsRef: ref(baseRef, 'questions'),
    streamerScoresRef: ref(baseRef, 'scores/streamers'),
    viewerScoresRef: ref(baseRef, 'scores/viewers'),
    inviteCodesRef: ref(baseRef, 'inviteCodes'),
    buzzerParticipantsRef: ref(baseRef, 'buzzer/participants'),
    currentBuzzRef: ref(baseRef, 'buzzer/currentBuzz'),
    questionStateRef: ref(baseRef, 'buzzer/questionState'),
  };
}

function showQuizMessage(message, tone = '') {
  if (!quizQuestionMessage) {
    return;
  }
  quizQuestionMessage.textContent = message;
  quizQuestionMessage.className = `message ${tone}`.trim();
}

function normalizeAnswers(rawValue) {
  return String(rawValue || '')
    .split(',')
    .map((answer) => answer.trim().toLowerCase())
    .filter(Boolean);
}

function sanitizeQuizOverlayCoord(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const rounded = Math.round(parsed);
  return Math.min(max, Math.max(min, rounded));
}

function normalizeQuizQaRect(value) {
  const raw = value || {};
  const x1 = sanitizeQuizOverlayCoord(raw.x1, DEFAULT_QUIZ_QA_RECT.x1, 0, QUIZ_OVERLAY_WIDTH_PX - 1);
  const y1 = sanitizeQuizOverlayCoord(raw.y1, DEFAULT_QUIZ_QA_RECT.y1, 0, QUIZ_OVERLAY_HEIGHT_PX - 1);
  const x2Raw = sanitizeQuizOverlayCoord(raw.x2, DEFAULT_QUIZ_QA_RECT.x2, 1, QUIZ_OVERLAY_WIDTH_PX);
  const y2Raw = sanitizeQuizOverlayCoord(raw.y2, DEFAULT_QUIZ_QA_RECT.y2, 1, QUIZ_OVERLAY_HEIGHT_PX);
  const x2 = Math.max(x1 + 1, x2Raw);
  const y2 = Math.max(y1 + 1, y2Raw);
  return { x1, y1, x2, y2 };
}

function readQuizQaRectFromInputs() {
  return normalizeQuizQaRect({
    x1: quizQaRectX1Input?.value,
    y1: quizQaRectY1Input?.value,
    x2: quizQaRectX2Input?.value,
    y2: quizQaRectY2Input?.value,
  });
}

function renderQuizQaRectInputs(rect = DEFAULT_QUIZ_QA_RECT) {
  if (quizQaRectX1Input) {
    quizQaRectX1Input.value = String(rect.x1);
  }
  if (quizQaRectY1Input) {
    quizQaRectY1Input.value = String(rect.y1);
  }
  if (quizQaRectX2Input) {
    quizQaRectX2Input.value = String(rect.x2);
  }
  if (quizQaRectY2Input) {
    quizQaRectY2Input.value = String(rect.y2);
  }
}

async function setQuizQaRect(rect) {
  const normalized = normalizeQuizQaRect(rect);
  renderQuizQaRectInputs(normalized);
  await update(activeProductRefs.overlayRef, {
    quizLayout: {
      questionAnswerRect: normalized,
    },
    updatedAt: Date.now(),
  });
}

function updateQuizMetrics() {
  if (quizMetricQuestions) {
    quizMetricQuestions.textContent = String(quizRound1State.questions.length);
  }
  if (quizMetricStreamers) {
    quizMetricStreamers.textContent = String(quizRound1State.streamerScores.length);
  }
  if (quizMetricViewers) {
    quizMetricViewers.textContent = String(quizRound1State.viewerScores.length);
  }
  if (quizMetricBuzzer) {
    quizMetricBuzzer.textContent = String(quizRound1State.buzzerParticipants.length);
  }
}

function formatQuizDate(value) {
  if (!value) {
    return 'N/A';
  }
  return new Date(value).toLocaleString('fr-FR');
}

async function resetScores(group) {
  const refs = getQuizRound1Refs();
  const source = group === 'viewers' ? quizRound1State.viewerScores : quizRound1State.streamerScores;
  const target = group === 'viewers' ? refs.viewerScoresRef : refs.streamerScoresRef;
  await Promise.all(
    source.map((entry) => update(ref(target, entry.id), { points: 0, updatedAt: Date.now() }))
  );
}

function renderQuizQuestions() {
  if (!quizQuestionsList) {
    return;
  }
  const sorted = [...quizRound1State.questions].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  if (!sorted.length) {
    quizQuestionsList.innerHTML = '<li class="empty">Aucune question.</li>';
    return;
  }

  quizQuestionsList.innerHTML = sorted
    .map((item, index) => {
      const answers = Array.isArray(item.answers) ? item.answers.join(' / ') : '-';
      return `
      <li>
        <div><strong>Q${index + 1}</strong> · ${escapeHtml(item.type || 'streamer')}<br />${escapeHtml(item.text || '')}</div>
        <small>Réponses: ${escapeHtml(answers)} · Créée: ${escapeHtml(formatQuizDate(item.createdAt))}</small>
        <div class="actions">
          <button type="button" class="secondary" data-quiz-ask="${escapeHtml(item.id)}">Afficher</button>
          <button type="button" class="danger ghost" data-quiz-delete="${escapeHtml(item.id)}">Supprimer</button>
        </div>
      </li>`;
    })
    .join('');

  quizQuestionsList.querySelectorAll('[data-quiz-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.getAttribute('data-quiz-delete');
      if (!id) {
        return;
      }
      await remove(ref(getQuizRound1Refs().questionsRef, id));
    });
  });

  quizQuestionsList.querySelectorAll('[data-quiz-ask]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.getAttribute('data-quiz-ask');
      const question = sorted.find((entry) => entry.id === id);
      if (!id || !question) {
        return;
      }
      await update(activeProductRefs.overlayRef, {
        quizRound: 1,
        currentQuestion: {
          id,
          type: question.type,
          text: question.text,
          answers: Array.isArray(question.answers) ? question.answers : [],
        },
      });
      showQuizMessage("Question envoyée vers l'overlay.");
    });
  });
}

function renderScoreList(container, entries, key) {
  if (!container) {
    return;
  }
  const sorted = [...entries].sort((a, b) => Number(b.points || 0) - Number(a.points || 0));
  if (!sorted.length) {
    container.innerHTML = '<li class="empty">Aucun joueur.</li>';
    return;
  }

  container.innerHTML = sorted
    .map(
      (entry, index) => `
      <li>
        <div><strong>#${index + 1}</strong> ${escapeHtml(entry.name || 'Sans nom')}</div>
        <div class="actions wrap">
          <button type="button" class="secondary" data-score-minus="${key}:${escapeHtml(entry.id)}">-1</button>
          <span>${Number(entry.points || 0)} pts</span>
          <button type="button" data-score-plus="${key}:${escapeHtml(entry.id)}">+1</button>
          <button type="button" class="danger ghost" data-score-delete="${key}:${escapeHtml(entry.id)}">Suppr.</button>
        </div>
      </li>`
    )
    .join('');

  container.querySelectorAll('[data-score-plus], [data-score-minus], [data-score-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      const token = button.getAttribute('data-score-plus') || button.getAttribute('data-score-minus') || button.getAttribute('data-score-delete');
      if (!token) {
        return;
      }
      const [group, id] = token.split(':');
      const refs = getQuizRound1Refs();
      const targetRef = group === 'viewers' ? ref(refs.viewerScoresRef, id) : ref(refs.streamerScoresRef, id);
      if (button.hasAttribute('data-score-delete')) {
        await remove(targetRef);
        return;
      }
      const source = group === 'viewers' ? quizRound1State.viewerScores : quizRound1State.streamerScores;
      const current = source.find((item) => item.id === id);
      const delta = button.hasAttribute('data-score-plus') ? 1 : -1;
      await update(targetRef, { points: Math.max(0, Number(current?.points || 0) + delta) });
    });
  });
}

function renderInviteCodes() {
  if (!quizInviteCodesList) {
    return;
  }
  if (!quizRound1State.inviteCodes.length) {
    quizInviteCodesList.innerHTML = '<li class="empty">Aucun code actif.</li>';
    return;
  }

  quizInviteCodesList.innerHTML = quizRound1State.inviteCodes
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .map(
      (entry) => `<li><div><strong>${escapeHtml(entry.code || '')}</strong></div><div class="actions wrap"><small>Créé le ${escapeHtml(formatQuizDate(entry.createdAt))}</small><button type="button" class="danger ghost" data-quiz-code-delete="${escapeHtml(entry.id)}">Suppr.</button></div></li>`
    )
    .join('');

  quizInviteCodesList.querySelectorAll('[data-quiz-code-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.getAttribute('data-quiz-code-delete');
      if (!id) {
        return;
      }
      await remove(ref(getQuizRound1Refs().inviteCodesRef, id));
    });
  });
}


function renderBuzzerLive() {
  if (!quizBuzzerLiveStatus || !quizBuzzParticipantsList) {
    return;
  }
  const buzz = quizRound1State.currentBuzz;
  quizBuzzerLiveStatus.textContent = buzz ? `🎯 ${buzz.pseudo || 'Participant'} a buzzé en premier.` : 'Aucun buzz en cours.';

  const participants = [...quizRound1State.buzzerParticipants].sort((a, b) => (a.pseudo || '').localeCompare(b.pseudo || '', 'fr'));
  if (!participants.length) {
    quizBuzzParticipantsList.innerHTML = '<li class="empty">Aucun participant connecté.</li>';
    return;
  }

  const blocked = quizRound1State.questionState?.blocked || {};
  quizBuzzParticipantsList.innerHTML = participants
    .map(
      (entry) => `<li>
      <div>${escapeHtml(entry.pseudo || 'Invité')}</div>
      <div class="actions wrap">
        <span>${blocked[entry.id] ? 'Bloqué' : 'Actif'}</span>
        <button type="button" class="secondary" data-buzz-fault="${escapeHtml(entry.id)}">Faute</button>
        <button type="button" data-buzz-unblock="${escapeHtml(entry.id)}">Débloquer</button>
      </div>
    </li>`
    )
    .join('');

  quizBuzzParticipantsList.querySelectorAll('[data-buzz-fault],[data-buzz-unblock]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.getAttribute('data-buzz-fault') || button.getAttribute('data-buzz-unblock');
      if (!id) {
        return;
      }
      const isFault = button.hasAttribute('data-buzz-fault');
      await update(getQuizRound1Refs().questionStateRef, {
        [`blocked/${id}`]: isFault,
      });
    });
  });
}

function bindQuizRoundNavigation() {
  quizRoundTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = String(tab.dataset.quizRound || '1');
      quizRoundTabs.forEach((entry) => entry.classList.toggle('is-active', entry === tab));
      quizRoundPanels.forEach((panel) => {
        const panelKey = String(panel.dataset.quizRoundPanel || 'placeholder');
        const active = panelKey === target || (target !== '1' && panelKey === 'placeholder');
        panel.classList.toggle('is-active', active);
      });
    });
  });
}

function bindQuizRealtime() {
  if (activeProductRefs.productKey !== 'zogquiz') {
    return;
  }
  const refs = getQuizRound1Refs();
  onValue(refs.questionsRef, (snapshot) => {
    const value = snapshot.val() || {};
    quizRound1State.questions = Object.entries(value).map(([id, entry]) => ({ id, ...(entry || {}) }));
    renderQuizQuestions();
    updateQuizMetrics();
  });
  onValue(refs.streamerScoresRef, (snapshot) => {
    const value = snapshot.val() || {};
    quizRound1State.streamerScores = Object.entries(value).map(([id, entry]) => ({ id, ...(entry || {}) }));
    renderScoreList(quizStreamerList, quizRound1State.streamerScores, 'streamers');
    updateQuizMetrics();
  });
  onValue(refs.viewerScoresRef, (snapshot) => {
    const value = snapshot.val() || {};
    quizRound1State.viewerScores = Object.entries(value).map(([id, entry]) => ({ id, ...(entry || {}) }));
    renderScoreList(quizViewerList, quizRound1State.viewerScores, 'viewers');
    updateQuizMetrics();
  });
  onValue(refs.inviteCodesRef, (snapshot) => {
    const value = snapshot.val() || {};
    quizRound1State.inviteCodes = Object.entries(value).map(([id, entry]) => ({ id, ...(entry || {}) }));
    renderInviteCodes();
  });
  onValue(refs.buzzerParticipantsRef, (snapshot) => {
    const value = snapshot.val() || {};
    quizRound1State.buzzerParticipants = Object.entries(value).map(([id, entry]) => ({ id, ...(entry || {}) }));
    renderBuzzerLive();
    updateQuizMetrics();
  });
  onValue(refs.currentBuzzRef, (snapshot) => {
    quizRound1State.currentBuzz = snapshot.val() || null;
    renderBuzzerLive();
  });
  onValue(refs.questionStateRef, (snapshot) => {
    quizRound1State.questionState = snapshot.val() || {};
    renderBuzzerLive();
  });
}

function bindQuizActions() {
  if (!quizQuestionForm) {
    return;
  }

  quizQuestionForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const type = String(quizQuestionTypeInput?.value || 'streamer');
      const text = String(quizQuestionTextInput?.value || '').trim();
      const answers = normalizeAnswers(quizQuestionAnswersInput?.value || '');
      if (!text || !answers.length) {
        showQuizMessage('Question et réponse obligatoires.', 'error');
        return;
      }
      const entryRef = push(getQuizRound1Refs().questionsRef);
      await set(entryRef, {
        type,
        text,
        answers,
        order: Date.now(),
        createdAt: Date.now(),
      });
      quizQuestionForm.reset();
      showQuizMessage('Question ajoutée.', 'success');
    } catch (error) {
      console.error('Impossible d’ajouter la question quiz', error);
      showQuizMessage("Erreur lors de l'ajout de la question.", 'error');
    }
  });

  quizStreamerForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = String(quizStreamerNameInput?.value || '').trim();
    if (!name) {
      return;
    }
    const exists = quizRound1State.streamerScores.some((entry) => String(entry.name || '').trim().toLowerCase() === name.toLowerCase());
    if (exists) {
      showQuizMessage('Ce streamer existe déjà.', 'warning');
      return;
    }
    await set(push(getQuizRound1Refs().streamerScoresRef), { name, points: 0, createdAt: Date.now() });
    quizStreamerForm.reset();
  });

  quizViewerForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = String(quizViewerNameInput?.value || '').trim();
    if (!name) {
      return;
    }
    const exists = quizRound1State.viewerScores.some((entry) => String(entry.name || '').trim().toLowerCase() === name.toLowerCase());
    if (exists) {
      showQuizMessage('Cette équipe viewers existe déjà.', 'warning');
      return;
    }
    await set(push(getQuizRound1Refs().viewerScoresRef), { name, points: 0, createdAt: Date.now() });
    quizViewerForm.reset();
  });

  quizGenerateCodeBtn?.addEventListener('click', async () => {
    try {
      const existingCodes = new Set(quizRound1State.inviteCodes.map((entry) => String(entry.code || '').toUpperCase()));
      let code = '';
      do {
        code = Math.random().toString(36).slice(2, 8).toUpperCase();
      } while (existingCodes.has(code));
      await set(push(getQuizRound1Refs().inviteCodesRef), {
        code,
        createdAt: Date.now(),
        used: false,
      });
      showQuizMessage(`Code généré: ${code}`, 'success');
    } catch (error) {
      console.error('Impossible de générer un code buzzer', error);
      showQuizMessage('Erreur lors de la génération du code.', 'error');
    }
  });

  quizClearInviteCodesBtn?.addEventListener('click', async () => {
    await set(getQuizRound1Refs().inviteCodesRef, null);
    showQuizMessage('Tous les codes ont été supprimés.', 'success');
  });

  quizResetBuzzBtn?.addEventListener('click', async () => {
    try {
      await remove(getQuizRound1Refs().currentBuzzRef);
      await set(getQuizRound1Refs().questionStateRef, {
        open: true,
        blocked: {},
        updatedAt: Date.now(),
      });
      showQuizMessage('Buzz réinitialisé pour la question suivante.', 'success');
    } catch (error) {
      console.error('Impossible de réinitialiser le buzz', error);
      showQuizMessage('Erreur lors du reset du buzz.', 'error');
    }
  });

  quizCloseQuestionBtn?.addEventListener('click', async () => {
    await update(getQuizRound1Refs().questionStateRef, { open: false, updatedAt: Date.now() });
    showQuizMessage('Question verrouillée : buzzer désactivé.', 'success');
  });

  quizOpenQuestionBtn?.addEventListener('click', async () => {
    await update(getQuizRound1Refs().questionStateRef, { open: true, updatedAt: Date.now() });
    showQuizMessage('Question déverrouillée : buzzer activé.', 'success');
  });

  quizClearQuestionsBtn?.addEventListener('click', async () => {
    await set(getQuizRound1Refs().questionsRef, null);
    showQuizMessage('Toutes les questions ont été supprimées.', 'success');
  });

  quizResetStreamerScoresBtn?.addEventListener('click', async () => {
    await resetScores('streamers');
    showQuizMessage('Scores streamers réinitialisés.', 'success');
  });

  quizResetViewerScoresBtn?.addEventListener('click', async () => {
    await resetScores('viewers');
    showQuizMessage('Scores viewers réinitialisés.', 'success');
  });

  quizResetRoundBtn?.addEventListener('click', async () => {
    const refs = getQuizRound1Refs();
    await Promise.all([
      set(refs.questionsRef, null),
      set(refs.streamerScoresRef, null),
      set(refs.viewerScoresRef, null),
      set(refs.inviteCodesRef, null),
      set(refs.buzzerParticipantsRef, null),
      set(refs.currentBuzzRef, null),
      set(refs.questionStateRef, { open: true, blocked: {}, updatedAt: Date.now() }),
    ]);
    showQuizMessage('Manche 1 entièrement réinitialisée.', 'success');
  });

  [quizQaRectX1Input, quizQaRectY1Input, quizQaRectX2Input, quizQaRectY2Input].forEach((input) => {
    input?.addEventListener('change', async () => {
      await setQuizQaRect(readQuizQaRectFromInputs());
    });
  });

  openQuizOverlayBtn?.addEventListener('click', () => {
    const params = new URLSearchParams();
    if (activeProductRefs.profileId) {
      params.set('profile', activeProductRefs.profileId);
    }
    params.set('product', 'quiz');
    window.open(`overlays/quiz-round1-overlay.html?${params.toString()}`, '_blank', 'width=1920,height=1080');
  });

  openBuzzerPageBtn?.addEventListener('click', () => {
    const params = new URLSearchParams();
    if (activeProductRefs.profileId) {
      params.set('profile', activeProductRefs.profileId);
    }
    params.set('product', 'quiz');
    window.open(`buzzer.html?${params.toString()}`, '_blank', 'width=880,height=760');
  });
}

bindQuizRoundNavigation();
bindQuizActions();
bindQuizRealtime();

function renderActiveProductView(viewName) {
  productViews.forEach((view) => {
    const isActive = view.dataset.productView === viewName;
    view.classList.toggle('is-active', isActive);
    view.setAttribute('aria-hidden', String(!isActive));
  });
  productTabs.forEach((tab) => {
    const isActive = tab.dataset.productTab === viewName;
    tab.classList.toggle('is-active', isActive);
    tab.classList.toggle('secondary', !isActive);
  });
}

function getCurrentProductTab() {
  return 'tournament';
}

productTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const nextTab = String(tab.dataset.productTab || 'tournament');
    if (nextTab === getCurrentProductTab()) {
      renderActiveProductView(nextTab);
      return;
    }

    const nextProduct = 'tournament';
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('product', nextProduct);
    window.location.href = nextUrl.toString();
  });
});

renderActiveProductView(getCurrentProductTab());

try {
  await ensureDatabaseShape();
} catch (error) {
  console.error('Impossible d’initialiser la base de données', error);
}
await loadParticipantImagePresets();
bindRealtimeSubscriptions();
renderConnectionStatus();
showLogin();
renderLiveWinnerControls();

timerTickHandle = window.setInterval(() => {
  persistTimerTick().catch((error) => {
    console.error('Erreur de synchronisation timer', error);
  });
  renderLiveTimerPanel();
}, TIMER_TICK_INTERVAL_MS);

window.addEventListener('beforeunload', () => {
  if (timerTickHandle) {
    window.clearInterval(timerTickHandle);
  }
});
