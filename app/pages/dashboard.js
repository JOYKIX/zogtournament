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
const openDuelOverlayBtn = document.getElementById('openDuelOverlayBtn');
const openTreeOverlayBtn = document.getElementById('openTreeOverlayBtn');
const overlayPrevBtn = document.getElementById('overlayPrevBtn');
const overlayNextBtn = document.getElementById('overlayNextBtn');
const duelImageHeightInput = document.getElementById('duelImageHeightPx');
const duelImageOffsetXInput = document.getElementById('duelImageOffsetXPx');
const duelImageOffsetYInput = document.getElementById('duelImageOffsetYPx');
const duelTextColorInput = document.getElementById('duelTextColor');
const duelTimerInitialSecondsInput = document.getElementById('duelTimerInitialSeconds');
const duelTimerProfileSelect = document.getElementById('duelTimerProfile');
const duelTimerOffsetYInput = document.getElementById('duelTimerOffsetYPx');
const timerStartParticipantSelect = document.getElementById('timerStartParticipant');
const timerStartBtn = document.getElementById('timerStartBtn');
const timerStopBtn = document.getElementById('timerStopBtn');
const timerSwitchBtn = document.getElementById('timerSwitchBtn');

const DEFAULT_DUEL_IMAGE_HEIGHT_PX = 760;
const MIN_DUEL_IMAGE_HEIGHT_PX = 200;
const MAX_DUEL_IMAGE_HEIGHT_PX = 1400;
const DEFAULT_DUEL_IMAGE_OFFSET_X_PX = 18;
const MIN_DUEL_IMAGE_OFFSET_X_PX = -300;
const MAX_DUEL_IMAGE_OFFSET_X_PX = 300;
const DEFAULT_DUEL_IMAGE_OFFSET_Y_PX = 0;
const MIN_DUEL_IMAGE_OFFSET_Y_PX = -400;
const MAX_DUEL_IMAGE_OFFSET_Y_PX = 400;
const DEFAULT_DUEL_TEXT_COLOR = '#f5f8ff';
const DEFAULT_TIMER_INITIAL_SECONDS = 300;
const DEFAULT_DUEL_TIMER_OFFSET_Y_PX = 0;
const MIN_DUEL_TIMER_OFFSET_Y_PX = -400;
const MAX_DUEL_TIMER_OFFSET_Y_PX = 400;
const DEFAULT_TIMER_LABEL_1 = 'Joueur 1';
const DEFAULT_TIMER_LABEL_2 = 'Joueur 2';
const DEFAULT_TIMER_PROFILE = 'classic';
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
  timerOffsetYPx: DEFAULT_DUEL_TIMER_OFFSET_Y_PX,
  timerProfile: DEFAULT_TIMER_PROFILE,
  timer: null,
};
let isConnected = false;
let usersLoaded = false;
let timerTickHandle = null;

function sanitizeDuelImageHeight(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_DUEL_IMAGE_HEIGHT_PX;
  }

  return Math.max(MIN_DUEL_IMAGE_HEIGHT_PX, Math.min(MAX_DUEL_IMAGE_HEIGHT_PX, Math.round(parsed)));
}

function sanitizeDuelImageOffsetX(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_DUEL_IMAGE_OFFSET_X_PX;
  }

  return Math.max(MIN_DUEL_IMAGE_OFFSET_X_PX, Math.min(MAX_DUEL_IMAGE_OFFSET_X_PX, Math.round(parsed)));
}

function sanitizeDuelImageOffsetY(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_DUEL_IMAGE_OFFSET_Y_PX;
  }

  return Math.max(MIN_DUEL_IMAGE_OFFSET_Y_PX, Math.min(MAX_DUEL_IMAGE_OFFSET_Y_PX, Math.round(parsed)));
}

function sanitizeTextColor(value) {
  const normalized = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : DEFAULT_DUEL_TEXT_COLOR;
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

  return Math.max(MIN_DUEL_TIMER_OFFSET_Y_PX, Math.min(MAX_DUEL_TIMER_OFFSET_Y_PX, Math.round(parsed)));
}

function sanitizeTimerLabel(value, fallback) {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

function sanitizeTimerProfile(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'healthbar' ? 'healthbar' : DEFAULT_TIMER_PROFILE;
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

  return {
    initialSeconds,
    participant1Ms,
    participant2Ms,
    participant1Label,
    participant2Label,
    profile,
    activeParticipant: isRunning ? activeParticipant : null,
    isRunning,
    lastUpdatedAt,
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
  const reachedZero = remaining === 0;

  return {
    ...timer,
    [key]: remaining,
    isRunning: reachedZero ? false : timer.isRunning,
    activeParticipant: reachedZero ? null : timer.activeParticipant,
    lastUpdatedAt: now,
  };
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

function renderBracket() {
  bracketContainer.innerHTML = '';

  if (!tournamentCache?.rounds?.length) {
    bracketContainer.innerHTML = '<p>Pas de bracket généré.</p>';
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

    bracketContainer.appendChild(roundCol);
  });

  if (tournamentCache.champion?.pseudo) {
    const championNode = document.createElement('div');
    championNode.className = 'champion-banner';
    championNode.innerHTML = `🏆 Vainqueur: <strong>${escapeHtml(tournamentCache.champion.pseudo)}</strong> (${escapeHtml(
      tournamentCache.champion.character || '—',
    )})`;
    bracketContainer.appendChild(championNode);
  } else if (current) {
    const helpNode = document.createElement('p');
    helpNode.className = 'hint';
    helpNode.textContent = 'Clique sur un joueur dans chaque match pour le faire avancer.';
    bracketContainer.appendChild(helpNode);
  }
}

async function setOverlayMatch(index) {
  const { flatMatches } = getCurrentOverlayMeta();
  if (!flatMatches.length) {
    return;
  }

  const clamped = Math.max(0, Math.min(index, flatMatches.length - 1));
  await update(overlayRef, {
    matchIndex: clamped,
    updatedAt: Date.now(),
  });
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
  renderParticipants();
  renderBracket();
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
      timerOffsetYPx: DEFAULT_DUEL_TIMER_OFFSET_Y_PX,
      timerProfile: DEFAULT_TIMER_PROFILE,
      timer: normalizeTimerState({
        initialSeconds: DEFAULT_TIMER_INITIAL_SECONDS,
        profile: DEFAULT_TIMER_PROFILE,
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

    if (!Number.isFinite(Number(value.overlay.timerOffsetYPx))) {
      patches.timerOffsetYPx = DEFAULT_DUEL_TIMER_OFFSET_Y_PX;
    }

    if (!value.overlay.timer || typeof value.overlay.timer !== 'object') {
      patches.timer = normalizeTimerState({ initialSeconds: DEFAULT_TIMER_INITIAL_SECONDS, profile: DEFAULT_TIMER_PROFILE });
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
    if (duelTimerInitialSecondsInput) {
      duelTimerInitialSecondsInput.value = String(currentOverlay.timer.initialSeconds);
    }
    if (duelTimerProfileSelect) {
      duelTimerProfileSelect.value = currentOverlay.timerProfile;
    }
    if (duelTimerOffsetYInput) {
      duelTimerOffsetYInput.value = String(currentOverlay.timerOffsetYPx);
    }
    if (timerStartParticipantSelect?.options?.[0]) {
      timerStartParticipantSelect.options[0].textContent = currentOverlay.timer.participant1Label;
    }
    if (timerStartParticipantSelect?.options?.[1]) {
      timerStartParticipantSelect.options[1].textContent = currentOverlay.timer.participant2Label;
    }

    renderBracket();
    syncTimerParticipantLabels();
  });
}

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

duelTimerInitialSecondsInput?.addEventListener('change', async (event) => {
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

timerTickHandle = window.setInterval(async () => {
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
