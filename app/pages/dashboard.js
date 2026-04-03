import {
  connectedRef,
  get,
  matchesRef,
  onValue,
  overlayRef,
  participantsRef,
  profileRef,
  push,
  ref,
  remove,
  rootRef,
  set,
  update,
  usersRef,
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
import { CAM_SLOT_IDS } from '../webrtc/constants.js';
import { GuestCamAdminManager } from '../webrtc/admin-room.js';
import { camSlotsRef } from '../webrtc/signaling.js';

const MAX_ACCOUNTS = 2;
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,24}$/;
const loginSection = document.getElementById('loginSection');
const appSection = document.getElementById('appSection');
const connectionStatus = document.getElementById('connectionStatus');
const createProfileForm = document.getElementById('createProfileForm');
const createProfileMessage = document.getElementById('createProfileMessage');
const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const logoutBtn = document.getElementById('logoutBtn');
const navItems = Array.from(document.querySelectorAll('.app-nav-item'));
const appViews = Array.from(document.querySelectorAll('.app-view'));

const participantForm = document.getElementById('participantForm');
const participantFormTitle = document.getElementById('participantFormTitle');
const participantsList = document.getElementById('participantsList');
const participantMessage = document.getElementById('participantMessage');
const editParticipantIdField = document.getElementById('editParticipantId');
const participantSubmitBtn = document.getElementById('participantSubmitBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const clearParticipantsBtn = document.getElementById('clearParticipantsBtn');

const generateBracketBtn = document.getElementById('generateBracketBtn');
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
const guestCamWidthInput = document.getElementById('guestCamWidthPx');
const guestCamHeightInput = document.getElementById('guestCamHeightPx');
const guestCamOffsetYInput = document.getElementById('guestCamOffsetYPx');
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
const camGuestsList = document.getElementById('camGuestsList');
const camStatus = document.getElementById('camStatus');

const DEFAULT_DUEL_IMAGE_HEIGHT_PX = 760;
const DEFAULT_DUEL_IMAGE_OFFSET_X_PX = 18;
const DEFAULT_DUEL_IMAGE_OFFSET_Y_PX = 0;
const DEFAULT_DUEL_TEXT_COLOR = '#f5f8ff';
const DEFAULT_GUEST_CAM_WIDTH_PX = 320;
const DEFAULT_GUEST_CAM_HEIGHT_PX = 180;
const DEFAULT_GUEST_CAM_OFFSET_Y_PX = 0;
const DEFAULT_TIMER_INITIAL_SECONDS = 300;
const DEFAULT_DUEL_TIMER_OFFSET_Y_PX = 0;
const DEFAULT_TIMER_LABEL_1 = 'Joueur 1';
const DEFAULT_TIMER_LABEL_2 = 'Joueur 2';
const DEFAULT_TIMER_PROFILE = 'classic';
const DEFAULT_TIMER_HEALTH_CONFIG = {
  enabled: true,
  barHeightPx: 26,
  barWidthPercent: 40,
  mainColor: '#3ef784',
  warningColor: '#ff9f1a',
  dangerColor: '#ff3a39',
  animationIntensity: 80,
  dangerEffects: true,
};
const MIN_TIMER_INITIAL_SECONDS = 10;
const MAX_TIMER_INITIAL_SECONDS = 7200;
const TIMER_TICK_INTERVAL_MS = 1000;
const TIMER_SECOND_MS = 1000;

let usersCache = [];
let participantsCache = [];
let tournamentCache = null;
let currentProfile = null;
let currentOverlay = {
  matchIndex: 0,
  imageHeightPx: DEFAULT_DUEL_IMAGE_HEIGHT_PX,
  imageOffsetXPx: DEFAULT_DUEL_IMAGE_OFFSET_X_PX,
  imageOffsetYPx: DEFAULT_DUEL_IMAGE_OFFSET_Y_PX,
  textColor: DEFAULT_DUEL_TEXT_COLOR,
  guestCamWidthPx: DEFAULT_GUEST_CAM_WIDTH_PX,
  guestCamHeightPx: DEFAULT_GUEST_CAM_HEIGHT_PX,
  guestCamOffsetYPx: DEFAULT_GUEST_CAM_OFFSET_Y_PX,
  timerOffsetYPx: DEFAULT_DUEL_TIMER_OFFSET_Y_PX,
  timerProfile: DEFAULT_TIMER_PROFILE,
  timer: null,
};
let isConnected = false;
let usersLoaded = false;
let timerTickHandle = null;
let keybindingManager = null;
let camGuestsCache = [];
let camSlotsCache = {};
const camStreams = new Map();
let camManager = null;

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

function sanitizeDuelImageHeight(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_DUEL_IMAGE_HEIGHT_PX;
  }

  return Math.round(parsed);
}

function sanitizeDuelImageOffsetX(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_DUEL_IMAGE_OFFSET_X_PX;
  }

  return Math.round(parsed);
}

function sanitizeDuelImageOffsetY(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_DUEL_IMAGE_OFFSET_Y_PX;
  }

  return Math.round(parsed);
}

function sanitizeTextColor(value) {
  const normalized = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : DEFAULT_DUEL_TEXT_COLOR;
}

function sanitizeGuestCamWidth(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_GUEST_CAM_WIDTH_PX;
  }

  return Math.max(120, Math.min(920, Math.round(parsed)));
}

function sanitizeGuestCamHeight(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_GUEST_CAM_HEIGHT_PX;
  }

  return Math.max(80, Math.min(520, Math.round(parsed)));
}

function sanitizeGuestCamOffsetY(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_GUEST_CAM_OFFSET_Y_PX;
  }

  return Math.round(parsed);
}

function sanitizeTimerInitialSeconds(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TIMER_INITIAL_SECONDS;
  }

  return Math.max(MIN_TIMER_INITIAL_SECONDS, Math.min(MAX_TIMER_INITIAL_SECONDS, Math.round(parsed)));
}

function sanitizeDuelTimerOffsetY(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_DUEL_TIMER_OFFSET_Y_PX;
  }

  return Math.round(parsed);
}

function sanitizeTimerLabel(value, fallback) {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

function sanitizeTimerProfile(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'healthbar' || normalized === 'fighting' || normalized === 'healthbars'
    ? 'healthbar'
    : DEFAULT_TIMER_PROFILE;
}

function sanitizeBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function sanitizeRange(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function sanitizeInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.round(parsed);
}

function sanitizeHealthColor(value, fallback) {
  const normalized = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : fallback;
}

function normalizeTimerHealthConfig(value = {}) {
  return {
    enabled: sanitizeBoolean(value.enabled, DEFAULT_TIMER_HEALTH_CONFIG.enabled),
    barHeightPx: sanitizeInteger(value.barHeightPx, DEFAULT_TIMER_HEALTH_CONFIG.barHeightPx),
    barWidthPercent: sanitizeInteger(value.barWidthPercent, DEFAULT_TIMER_HEALTH_CONFIG.barWidthPercent),
    mainColor: sanitizeHealthColor(value.mainColor, DEFAULT_TIMER_HEALTH_CONFIG.mainColor),
    warningColor: sanitizeHealthColor(value.warningColor, DEFAULT_TIMER_HEALTH_CONFIG.warningColor),
    dangerColor: sanitizeHealthColor(value.dangerColor, DEFAULT_TIMER_HEALTH_CONFIG.dangerColor),
    animationIntensity: sanitizeRange(value.animationIntensity, DEFAULT_TIMER_HEALTH_CONFIG.animationIntensity, 0, 100),
    dangerEffects: sanitizeBoolean(value.dangerEffects, DEFAULT_TIMER_HEALTH_CONFIG.dangerEffects),
  };
}

function normalizeTimerState(timerValue = {}) {
  const initialSeconds = sanitizeTimerInitialSeconds(timerValue.initialSeconds);
  const initialMs = initialSeconds * TIMER_SECOND_MS;
  const participant1Ms = Math.max(0, Math.round(Number(timerValue.participant1Ms ?? initialMs) || initialMs));
  const participant2Ms = Math.max(0, Math.round(Number(timerValue.participant2Ms ?? initialMs) || initialMs));
  const activeParticipant =
    timerValue.activeParticipant === 1 || timerValue.activeParticipant === 2 ? timerValue.activeParticipant : null;
  const isRunning = Boolean(timerValue.isRunning && activeParticipant);
  const lastUpdatedAt = Number(timerValue.lastUpdatedAt || Date.now());
  const participant1Label = sanitizeTimerLabel(timerValue.participant1Label, DEFAULT_TIMER_LABEL_1);
  const participant2Label = sanitizeTimerLabel(timerValue.participant2Label, DEFAULT_TIMER_LABEL_2);
  const profile = sanitizeTimerProfile(timerValue.profile);
  const healthConfig = normalizeTimerHealthConfig(timerValue.healthConfig);

  return {
    initialSeconds,
    participant1Ms,
    participant2Ms,
    participant1Label,
    participant2Label,
    profile,
    healthConfig,
    activeParticipant: isRunning ? activeParticipant : null,
    isRunning,
    lastUpdatedAt,
  };
}

function resetTimerState(timer, now = Date.now(), labels = null) {
  const normalized = normalizeTimerState(timer);
  const initialMs = normalized.initialSeconds * TIMER_SECOND_MS;
  const nextLabels = labels || {
    participant1Label: normalized.participant1Label,
    participant2Label: normalized.participant2Label,
  };

  return {
    ...normalized,
    participant1Ms: initialMs,
    participant2Ms: initialMs,
    participant1Label: sanitizeTimerLabel(nextLabels.participant1Label, DEFAULT_TIMER_LABEL_1),
    participant2Label: sanitizeTimerLabel(nextLabels.participant2Label, DEFAULT_TIMER_LABEL_2),
    activeParticipant: null,
    isRunning: false,
    lastUpdatedAt: now,
  };
}

function resolveTimerNow(baseTimer, now = Date.now()) {
  const timer = normalizeTimerState(baseTimer);
  if (!timer.isRunning || !timer.activeParticipant) {
    return timer;
  }

  const elapsed = Math.max(0, now - timer.lastUpdatedAt);
  if (elapsed <= 0) {
    return timer;
  }

  const key = timer.activeParticipant === 1 ? 'participant1Ms' : 'participant2Ms';
  const remaining = Math.max(0, timer[key] - elapsed);
  if (remaining === 0) {
    return resetTimerState(timer, now);
  }

  return {
    ...timer,
    [key]: remaining,
    lastUpdatedAt: now,
  };
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
  return ['participants', 'config', 'keybinds', 'live', 'cam'].includes(normalized) ? normalized : 'participants';
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
  const timer = resolveTimerNow(currentOverlay.timer, Date.now());
  const activeParticipant = timer.activeParticipant;

  if (liveCountdownP1) {
    liveCountdownP1.textContent = `${timer.participant1Label}: ${formatMsToClock(timer.participant1Ms)}`;
    liveCountdownP1.classList.toggle('is-active', Boolean(timer.isRunning && activeParticipant === 1));
  }

  if (liveCountdownP2) {
    liveCountdownP2.textContent = `${timer.participant2Label}: ${formatMsToClock(timer.participant2Ms)}`;
    liveCountdownP2.classList.toggle('is-active', Boolean(timer.isRunning && activeParticipant === 2));
  }

  if (!liveTimerStatus) {
    return;
  }

  if (!timer.isRunning || !activeParticipant) {
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
      id,
      ...participant,
    }));
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
      const leftName = escapeHtml(match.left?.pseudo || 'En attente');
      const rightName = escapeHtml(match.right?.pseudo || 'En attente');
      const leftCharacter = escapeHtml(match.left?.character || '—');
      const rightCharacter = escapeHtml(match.right?.character || '—');

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

  await update(overlayRef, payload);
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

  await update(overlayRef, {
    imageHeightPx: safeHeight,
    updatedAt: Date.now(),
  });
}

async function setOverlayImageOffsetX(offsetXPx) {
  const safeOffset = sanitizeDuelImageOffsetX(offsetXPx);

  await update(overlayRef, {
    imageOffsetXPx: safeOffset,
    updatedAt: Date.now(),
  });
}

async function setOverlayImageOffsetY(offsetYPx) {
  const safeOffset = sanitizeDuelImageOffsetY(offsetYPx);

  await update(overlayRef, {
    imageOffsetYPx: safeOffset,
    updatedAt: Date.now(),
  });
}

async function setOverlayTextColor(textColor) {
  const safeColor = sanitizeTextColor(textColor);

  await update(overlayRef, {
    textColor: safeColor,
    updatedAt: Date.now(),
  });
}

async function setOverlayGuestCamWidth(widthPx) {
  const safeWidth = sanitizeGuestCamWidth(widthPx);

  await update(overlayRef, {
    guestCamWidthPx: safeWidth,
    updatedAt: Date.now(),
  });
}

async function setOverlayGuestCamHeight(heightPx) {
  const safeHeight = sanitizeGuestCamHeight(heightPx);

  await update(overlayRef, {
    guestCamHeightPx: safeHeight,
    updatedAt: Date.now(),
  });
}

async function setOverlayGuestCamOffsetY(offsetYPx) {
  const safeOffset = sanitizeGuestCamOffsetY(offsetYPx);

  await update(overlayRef, {
    guestCamOffsetYPx: safeOffset,
    updatedAt: Date.now(),
  });
}

async function setOverlayTimerOffsetY(timerOffsetYPx) {
  const safeOffset = sanitizeDuelTimerOffsetY(timerOffsetYPx);

  await update(overlayRef, {
    timerOffsetYPx: safeOffset,
    updatedAt: Date.now(),
  });
}

async function setOverlayTimer(timer) {
  const normalizedTimer = normalizeTimerState(timer);
  await update(overlayRef, {
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
  const timer = normalizeTimerState(currentOverlay.timer);
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
  const nextTimer = normalizeTimerState(currentOverlay.timer);
  const initialMs = safeInitialSeconds * TIMER_SECOND_MS;
  nextTimer.initialSeconds = safeInitialSeconds;
  nextTimer.participant1Ms = initialMs;
  nextTimer.participant2Ms = initialMs;
  nextTimer.activeParticipant = null;
  nextTimer.isRunning = false;
  nextTimer.lastUpdatedAt = Date.now();

  await setOverlayTimer(nextTimer);
}

async function setTimerProfile(profile) {
  const safeProfile = sanitizeTimerProfile(profile);
  const nextTimer = normalizeTimerState(currentOverlay.timer);
  nextTimer.profile = safeProfile;
  await setOverlayTimer(nextTimer);
}

async function setTimerHealthConfig(partialConfig) {
  const nextTimer = normalizeTimerState(currentOverlay.timer);
  nextTimer.healthConfig = normalizeTimerHealthConfig({
    ...nextTimer.healthConfig,
    ...partialConfig,
  });
  await setOverlayTimer(nextTimer);
}

async function startTimer(participant) {
  const starter = participant === 2 ? 2 : 1;
  const now = Date.now();
  const timer = resolveTimerNow(currentOverlay.timer, now);
  const key = starter === 1 ? 'participant1Ms' : 'participant2Ms';

  if (timer[key] <= 0) {
    return;
  }

  timer.activeParticipant = starter;
  timer.isRunning = true;
  timer.lastUpdatedAt = now;
  await setOverlayTimer(timer);
}

async function stopTimer() {
  const timer = resolveTimerNow(currentOverlay.timer, Date.now());
  timer.activeParticipant = null;
  timer.isRunning = false;
  timer.lastUpdatedAt = Date.now();
  await setOverlayTimer(timer);
}

async function switchTimer() {
  const timer = resolveTimerNow(currentOverlay.timer, Date.now());
  if (!timer.isRunning || !timer.activeParticipant) {
    return;
  }

  const nextParticipant = timer.activeParticipant === 1 ? 2 : 1;
  const nextKey = nextParticipant === 1 ? 'participant1Ms' : 'participant2Ms';
  if (timer[nextKey] <= 0) {
    timer.activeParticipant = null;
    timer.isRunning = false;
    timer.lastUpdatedAt = Date.now();
    await setOverlayTimer(timer);
    return;
  }

  timer.activeParticipant = nextParticipant;
  timer.isRunning = true;
  timer.lastUpdatedAt = Date.now();
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

  const tournament = createTournament(participantsCache);
  await set(matchesRef, tournament);
  await setOverlayMatch(0);
}

async function setWinner(roundIndex, matchIndex, side) {
  if (!tournamentCache?.rounds?.[roundIndex]?.[matchIndex]) {
    return;
  }

  const rebuilt = updateMatchWinner(tournamentCache, roundIndex, matchIndex, side);
  if (!rebuilt) {
    return;
  }

  await set(matchesRef, rebuilt);
}

async function setCurrentMatchWinner(side) {
  const { current } = getCurrentOverlayMeta();
  if (!current) {
    return;
  }

  await setWinner(current.roundIndex, current.matchIndex, side);
}

function openDuelOverlayWindow() {
  window.open('overlay.html', '_blank', 'width=1600,height=900');
}

function openTreeOverlayWindow() {
  window.open('overlay-tree.html', '_blank', 'width=1600,height=900');
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

  await set(profileRef, {
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

  const userRef = push(usersRef);
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
  await set(profileRef, null);
  await update(overlayRef, {
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

function getCamStatusLabel(guest) {
  if (!guest) {
    return 'En attente';
  }
  if (!guest.cameraEnabled) {
    return 'Caméra absente';
  }
  if (!guest.microphoneEnabled) {
    return 'Micro absent';
  }
  if (guest.status === 'connected') {
    return 'Connecté';
  }
  if (guest.status === 'connecting') {
    return 'Connexion';
  }
  if (guest.status === 'disconnected') {
    return 'Déconnecté';
  }
  return 'En attente';
}

function renderCamView() {
  if (!camGuestsList) {
    return;
  }

  if (!camGuestsCache.length) {
    camGuestsList.innerHTML = '<p class="message">Aucun membre dans le vocal.</p>';
    if (camStatus) {
      camStatus.textContent = 'En attente d’invités.';
    }
    return;
  }

  if (camStatus) {
    camStatus.textContent = `${camGuestsCache.length} invité(s) connecté(s).`;
  }

  camGuestsList.innerHTML = camGuestsCache
    .map((guest) => {
      const selectedSlot =
        CAM_SLOT_IDS.find((slotId) => camSlotsCache?.[slotId]?.guestId === guest.id) || '';
      const hasStream = Boolean(camStreams.get(guest.id));
      return `
        <article class="sub-card cam-guest-card" data-guest-id="${guest.id}">
          <div class="cam-guest-head">
            <h4>${escapeHtml(guest.name)}</h4>
            <span class="cam-presence ${hasStream ? 'is-online' : 'is-idle'}">${hasStream ? 'En vocal' : 'Hors ligne'}</span>
          </div>
          <p class="message no-margin">${getCamStatusLabel(guest)} · ${guest.microphoneEnabled ? 'Micro OK' : 'Micro coupé'}</p>
          <video class="cam-preview" data-guest-video="${guest.id}" autoplay playsinline muted></video>
          <div class="cam-controls-row">
            <label class="setting-field">Slot overlay
              <select data-cam-slot="${guest.id}">
                <option value="">Non affiché</option>
                ${CAM_SLOT_IDS.map(
                  (slotId) =>
                    `<option value="${slotId}" ${selectedSlot === slotId ? 'selected' : ''}>${slotId.toUpperCase()}</option>`
                ).join('')}
              </select>
            </label>
            <label class="setting-field inline-toggle">Visible
              <input type="checkbox" data-cam-visible="${guest.id}" ${selectedSlot && camSlotsCache?.[selectedSlot]?.visible ? 'checked' : ''} />
            </label>
            <button type="button" class="ghost danger" data-cam-remove="${guest.id}">Retirer</button>
          </div>
        </article>
      `;
    })
    .join('');

  camGuestsCache.forEach((guest) => {
    const video = camGuestsList.querySelector(`[data-guest-video="${guest.id}"]`);
    if (video instanceof HTMLVideoElement) {
      video.srcObject = camStreams.get(guest.id) || null;
    }
  });
}

async function refreshUsersCache() {
  const snapshot = await get(usersRef);
  usersCache = normalizeUsers(snapshot.val() || {});
  usersLoaded = true;
}

async function ensureDatabaseShape() {
  const snapshot = await get(rootRef);
  const value = snapshot.val() || {};

  if (!value.users || typeof value.users !== 'object') {
    await set(usersRef, {});
  }

  if (!value.participants || typeof value.participants !== 'object') {
    await set(participantsRef, {});
  }

  if (!value.matches) {
    await set(matchesRef, null);
  }

  if (!value.overlay || typeof value.overlay !== 'object') {
    await set(overlayRef, {
      matchIndex: 0,
      imageHeightPx: DEFAULT_DUEL_IMAGE_HEIGHT_PX,
      imageOffsetXPx: DEFAULT_DUEL_IMAGE_OFFSET_X_PX,
      imageOffsetYPx: DEFAULT_DUEL_IMAGE_OFFSET_Y_PX,
      textColor: DEFAULT_DUEL_TEXT_COLOR,
      guestCamWidthPx: DEFAULT_GUEST_CAM_WIDTH_PX,
      guestCamHeightPx: DEFAULT_GUEST_CAM_HEIGHT_PX,
      guestCamOffsetYPx: DEFAULT_GUEST_CAM_OFFSET_Y_PX,
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
    if (!Number.isFinite(Number(value.overlay.guestCamWidthPx))) {
      patches.guestCamWidthPx = DEFAULT_GUEST_CAM_WIDTH_PX;
    }
    if (!Number.isFinite(Number(value.overlay.guestCamHeightPx))) {
      patches.guestCamHeightPx = DEFAULT_GUEST_CAM_HEIGHT_PX;
    }
    if (!Number.isFinite(Number(value.overlay.guestCamOffsetYPx))) {
      patches.guestCamOffsetYPx = DEFAULT_GUEST_CAM_OFFSET_Y_PX;
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
      await update(overlayRef, patches);
    }
  }

  if (value.profile === undefined) {
    await set(profileRef, null);
  }

  if (!value.cam || typeof value.cam !== 'object') {
    await set(ref(rootRef, 'cam'), {
      guests: {},
      slots: {
        slot1: { guestId: null, visible: false, updatedAt: Date.now() },
        slot2: { guestId: null, visible: false, updatedAt: Date.now() },
        slot3: { guestId: null, visible: false, updatedAt: Date.now() },
      },
      signals: {
        admin: {},
        overlay: {},
      },
    });
  } else {
    const camPatches = {};
    CAM_SLOT_IDS.forEach((slotId) => {
      if (!value.cam.slots || typeof value.cam.slots[slotId] !== 'object') {
        camPatches[`slots/${slotId}`] = { guestId: null, visible: false, updatedAt: Date.now() };
      }
    });
    if (!value.cam.signals || typeof value.cam.signals !== 'object') {
      camPatches.signals = { admin: {}, overlay: {} };
    }
    if (!value.cam.guests || typeof value.cam.guests !== 'object') {
      camPatches.guests = {};
    }
    if (Object.keys(camPatches).length) {
      await update(ref(rootRef, 'cam'), camPatches);
    }
  }

  if (value.profiles !== undefined) {
    await remove(ref(rootRef, 'profiles'));
  }
}

function bindRealtimeSubscriptions() {
  onValue(connectedRef, (snapshot) => {
    isConnected = snapshot.val() === true;
    renderConnectionStatus();
  });

  onValue(usersRef, async (snapshot) => {
    const usersMap = snapshot.val() || {};
    usersCache = normalizeUsers(usersMap);
    usersLoaded = true;

    if (currentProfile?.uid && !usersMap[currentProfile.uid]) {
      await logout();
    }
  });

  onValue(profileRef, (snapshot) => {
    currentProfile = snapshot.val();

    if (currentProfile?.username) {
      showApp();
      return;
    }

    showLogin();
  });

  onValue(participantsRef, (snapshot) => {
    participantsCache = normalizeParticipants(snapshot.val());
    renderParticipants();
  });

  onValue(matchesRef, (snapshot) => {
    tournamentCache = normalizeTournament(snapshot.val());
    renderBracket();
    renderLiveWinnerControls();
    syncTimerParticipantLabels();
  });

  onValue(overlayRef, (snapshot) => {
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
      guestCamWidthPx: sanitizeGuestCamWidth(value.guestCamWidthPx),
      guestCamHeightPx: sanitizeGuestCamHeight(value.guestCamHeightPx),
      guestCamOffsetYPx: sanitizeGuestCamOffsetY(value.guestCamOffsetYPx),
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
    if (guestCamWidthInput) {
      guestCamWidthInput.value = String(currentOverlay.guestCamWidthPx);
    }
    if (guestCamHeightInput) {
      guestCamHeightInput.value = String(currentOverlay.guestCamHeightPx);
    }
    if (guestCamOffsetYInput) {
      guestCamOffsetYInput.value = String(currentOverlay.guestCamOffsetYPx);
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

    renderBracket();
    renderLiveTimerPanel();
    renderLiveWinnerControls();
    syncTimerParticipantLabels();
  });

  onValue(camSlotsRef(), (snapshot) => {
    camSlotsCache = snapshot.val() || {};
    renderCamView();
  });

  camManager = new GuestCamAdminManager({
    onGuestsChanged: (guests) => {
      camGuestsCache = guests;
      renderCamView();
    },
    onRemoteTrack: (guestId, stream) => {
      if (stream) {
        camStreams.set(guestId, stream);
      } else {
        camStreams.delete(guestId);
      }
      renderCamView();
    },
    onLog: (message) => {
      console.log('[CamAdmin]', message);
    },
  });
  camManager.start();
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
    await update(ref(participantsRef, editId), participant);
    participantMessage.textContent = 'Participant modifié ✅';
    toggleEditMode();
    return;
  }

  const newParticipantRef = push(participantsRef);
  await set(newParticipantRef, participant);

  participantMessage.textContent = 'Participant ajouté ✅';
  toggleEditMode();
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

  const participantRef = ref(participantsRef, participantId);
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

  await set(participantsRef, {});
  await set(matchesRef, null);
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

guestCamWidthInput?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  const safeWidth = sanitizeGuestCamWidth(target.value);
  target.value = String(safeWidth);
  await setOverlayGuestCamWidth(safeWidth);
});

guestCamHeightInput?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  const safeHeight = sanitizeGuestCamHeight(target.value);
  target.value = String(safeHeight);
  await setOverlayGuestCamHeight(safeHeight);
});

guestCamOffsetYInput?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  const safeOffset = sanitizeGuestCamOffsetY(target.value);
  target.value = String(safeOffset);
  await setOverlayGuestCamOffsetY(safeOffset);
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

camGuestsList?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement) || !camManager) {
    return;
  }

  if (target instanceof HTMLSelectElement && target.dataset.camSlot) {
    const guestId = target.dataset.camSlot;
    const slotId = target.value;
    if (!slotId) {
      for (const candidateSlot of CAM_SLOT_IDS) {
        if (camSlotsCache?.[candidateSlot]?.guestId === guestId) {
          await camManager.assignSlot(candidateSlot, null);
        }
      }
      return;
    }

    for (const candidateSlot of CAM_SLOT_IDS) {
      if (candidateSlot !== slotId && camSlotsCache?.[candidateSlot]?.guestId === guestId) {
        await camManager.assignSlot(candidateSlot, null);
      }
    }
    await camManager.assignSlot(slotId, guestId);
    return;
  }

  if (target instanceof HTMLInputElement && target.dataset.camVisible) {
    const guestId = target.dataset.camVisible;
    const slotId = CAM_SLOT_IDS.find((candidateSlot) => camSlotsCache?.[candidateSlot]?.guestId === guestId);
    if (!slotId) {
      return;
    }
    await camManager.setSlotVisibility(slotId, target.checked);
  }
});

camGuestsList?.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement) || !camManager) {
    return;
  }

  const button = target.closest('[data-cam-remove]');
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  const guestId = button.dataset.camRemove;
  if (!guestId) {
    return;
  }

  for (const slotId of CAM_SLOT_IDS) {
    if (camSlotsCache?.[slotId]?.guestId === guestId) {
      await camManager.assignSlot(slotId, null);
    }
  }
  await camManager.removeGuestSlotBindings(guestId);
});

openDuelOverlayBtn.addEventListener('click', openDuelOverlayWindow);
openTreeOverlayBtn.addEventListener('click', openTreeOverlayWindow);
logoutBtn.addEventListener('click', () => {
  logout();
});

try {
  await ensureDatabaseShape();
} catch (error) {
  console.error('Impossible d’initialiser la base de données', error);
}
bindRealtimeSubscriptions();
renderConnectionStatus();
showLogin();
renderLiveWinnerControls();

timerTickHandle = window.setInterval(async () => {
  renderLiveTimerPanel();

  if (!currentOverlay.timer?.isRunning || !currentOverlay.timer.activeParticipant) {
    return;
  }

  const baseTimer = normalizeTimerState(currentOverlay.timer);
  const resolved = resolveTimerNow(baseTimer, Date.now());
  if (
    resolved.participant1Ms === baseTimer.participant1Ms &&
    resolved.participant2Ms === baseTimer.participant2Ms &&
    resolved.isRunning === baseTimer.isRunning &&
    resolved.activeParticipant === baseTimer.activeParticipant
  ) {
    return;
  }

  await setOverlayTimer(resolved);
}, TIMER_TICK_INTERVAL_MS);

window.addEventListener('beforeunload', () => {
  if (timerTickHandle) {
    window.clearInterval(timerTickHandle);
  }
  camManager?.stop();
});
