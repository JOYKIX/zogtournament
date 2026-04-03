import { matchesRef, onValue, overlayRef } from '../shared/firebase.js';
import { getOverlayMatches, normalizeTournament } from '../shared/tournament.js';
import { escapeHtml, normalizeImageUrl } from '../shared/view-helpers.js';

const leftFighter = document.getElementById('leftFighter');
const rightFighter = document.getElementById('rightFighter');
const duelView = document.querySelector('.duel-view');
const duelTimers = document.querySelector('.duel-timers');
const timerParticipant1 = document.getElementById('timerParticipant1');
const timerParticipant2 = document.getElementById('timerParticipant2');
const timerP1Label = document.getElementById('timerP1Label');
const timerP2Label = document.getElementById('timerP2Label');
const timerP1Value = document.getElementById('timerP1Value');
const timerP2Value = document.getElementById('timerP2Value');

const DEFAULT_DUEL_IMAGE_HEIGHT_PX = 760;
const MIN_DUEL_IMAGE_HEIGHT_PX = 200;
const MAX_DUEL_IMAGE_HEIGHT_PX = 1400;
const DEFAULT_DUEL_IMAGE_GAP_PX = 36;
const MIN_DUEL_IMAGE_GAP_PX = 0;
const MAX_DUEL_IMAGE_GAP_PX = 600;
const DEFAULT_DUEL_TEXT_COLOR = '#f5f8ff';
const DEFAULT_TIMER_INITIAL_SECONDS = 300;
const DEFAULT_DUEL_TIMER_OFFSET_Y_PX = 0;
const MIN_DUEL_TIMER_OFFSET_Y_PX = -400;
const MAX_DUEL_TIMER_OFFSET_Y_PX = 400;
const DEFAULT_TIMER_LABEL_1 = 'Participant 1';
const DEFAULT_TIMER_LABEL_2 = 'Participant 2';
const TIMER_SECOND_MS = 1000;

let tournamentCache = null;
let currentMatchIndex = 0;
let currentImageHeightPx = DEFAULT_DUEL_IMAGE_HEIGHT_PX;
let currentImageGapPx = DEFAULT_DUEL_IMAGE_GAP_PX;
let currentTextColor = DEFAULT_DUEL_TEXT_COLOR;
let currentTimerOffsetYPx = DEFAULT_DUEL_TIMER_OFFSET_Y_PX;
let currentTimer = null;

function sanitizeDuelImageHeight(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_DUEL_IMAGE_HEIGHT_PX;
  }

  return Math.max(MIN_DUEL_IMAGE_HEIGHT_PX, Math.min(MAX_DUEL_IMAGE_HEIGHT_PX, Math.round(parsed)));
}

function sanitizeDuelImageGap(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_DUEL_IMAGE_GAP_PX;
  }

  return Math.max(MIN_DUEL_IMAGE_GAP_PX, Math.min(MAX_DUEL_IMAGE_GAP_PX, Math.round(parsed)));
}

function sanitizeTextColor(value) {
  const normalized = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : DEFAULT_DUEL_TEXT_COLOR;
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

function normalizeTimerState(timerValue = {}) {
  const initialSeconds = Number(timerValue.initialSeconds || DEFAULT_TIMER_INITIAL_SECONDS);
  const safeInitialSeconds = Number.isFinite(initialSeconds) ? Math.max(10, Math.min(7200, Math.round(initialSeconds))) : DEFAULT_TIMER_INITIAL_SECONDS;
  const initialMs = safeInitialSeconds * TIMER_SECOND_MS;
  const participant1Ms = Math.max(0, Math.round(Number(timerValue.participant1Ms ?? initialMs) || initialMs));
  const participant2Ms = Math.max(0, Math.round(Number(timerValue.participant2Ms ?? initialMs) || initialMs));
  const activeParticipant =
    timerValue.activeParticipant === 1 || timerValue.activeParticipant === 2 ? timerValue.activeParticipant : null;
  const isRunning = Boolean(timerValue.isRunning && activeParticipant);
  const lastUpdatedAt = Number(timerValue.lastUpdatedAt || Date.now());
  const participant1Label = sanitizeTimerLabel(timerValue.participant1Label, DEFAULT_TIMER_LABEL_1);
  const participant2Label = sanitizeTimerLabel(timerValue.participant2Label, DEFAULT_TIMER_LABEL_2);

  return {
    initialSeconds: safeInitialSeconds,
    participant1Ms,
    participant2Ms,
    participant1Label,
    participant2Label,
    activeParticipant: isRunning ? activeParticipant : null,
    isRunning,
    lastUpdatedAt,
  };
}

function formatTimer(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / TIMER_SECOND_MS));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function fighterMarkup(player) {
  if (!player) {
    return '<div class="fighter-card"><div class="name">En attente</div></div>';
  }

  const safePseudo = escapeHtml(player.pseudo || 'Inconnu');
  const safeCharacter = escapeHtml(player.character || 'Personnage inconnu');

  return `
    <div class="fighter-card">
      <img src="${normalizeImageUrl(player.image, 'https://placehold.co/600x800?text=No+Image')}" alt="${safeCharacter}" />
      <div class="character">${safeCharacter}</div>
      <div class="name">${safePseudo}</div>
    </div>
  `;
}

function render() {
  const overlayMatches = getOverlayMatches(tournamentCache);
  const safeIndex = Math.max(0, Math.min(currentMatchIndex, Math.max(overlayMatches.length - 1, 0)));
  const match = overlayMatches[safeIndex];

  leftFighter.innerHTML = fighterMarkup(match?.left);
  rightFighter.innerHTML = fighterMarkup(match?.right);

  if (duelView) {
    duelView.style.setProperty('--fighter-image-height', `${currentImageHeightPx}px`);
    duelView.style.setProperty('--fighter-gap', `${currentImageGapPx}px`);
    duelView.style.setProperty('--fighter-text-color', currentTextColor);
  }
  if (duelTimers) {
    duelTimers.style.setProperty('--duel-timer-offset-y', `${currentTimerOffsetYPx}px`);
  }

  const resolvedTimer = normalizeTimerState(currentTimer);
  if (timerP1Value) {
    timerP1Value.textContent = formatTimer(resolvedTimer.participant1Ms);
  }
  if (timerP2Value) {
    timerP2Value.textContent = formatTimer(resolvedTimer.participant2Ms);
  }
  if (timerP1Label) {
    timerP1Label.textContent = resolvedTimer.participant1Label;
  }
  if (timerP2Label) {
    timerP2Label.textContent = resolvedTimer.participant2Label;
  }

  if (timerParticipant1 && timerParticipant2) {
    timerParticipant1.classList.toggle('active', resolvedTimer.isRunning && resolvedTimer.activeParticipant === 1);
    timerParticipant2.classList.toggle('active', resolvedTimer.isRunning && resolvedTimer.activeParticipant === 2);
  }
}

onValue(matchesRef, (snapshot) => {
  tournamentCache = normalizeTournament(snapshot.val());
  render();
});

onValue(overlayRef, (snapshot) => {
  const value = snapshot.val() || {};
  currentMatchIndex = Number(value.matchIndex || 0);
  currentImageHeightPx = sanitizeDuelImageHeight(value.imageHeightPx);
  currentImageGapPx = sanitizeDuelImageGap(value.imageGapPx);
  currentTextColor = sanitizeTextColor(value.textColor);
  currentTimerOffsetYPx = sanitizeDuelTimerOffsetY(value.timerOffsetYPx);
  currentTimer = normalizeTimerState(value.timer);
  render();
});
