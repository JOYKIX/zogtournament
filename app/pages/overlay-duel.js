import { getProductRefsBySlug, onValue } from '../shared/firebase.js';
import { getOverlayMatches, normalizeTournament } from '../shared/tournament.js';
import { normalizeTimerState as normalizeSharedTimerState } from '../shared/timer-state.js';
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
const timerCenterValue = document.getElementById('timerCenterValue');
const timerP1HealthFill = document.getElementById('timerP1HealthFill');
const timerP2HealthFill = document.getElementById('timerP2HealthFill');
const timerP1HealthTrail = document.getElementById('timerP1HealthTrail');
const timerP2HealthTrail = document.getElementById('timerP2HealthTrail');

const DEFAULT_DUEL_IMAGE_HEIGHT_PX = 760;
const DEFAULT_DUEL_IMAGE_OFFSET_X_PX = 18;
const DEFAULT_DUEL_IMAGE_OFFSET_Y_PX = 0;
const DEFAULT_DUEL_TEXT_COLOR = '#f5f8ff';
const DEFAULT_DUEL_TIMER_TEXT_COLOR = '#f5f8ff';
const DEFAULT_DUEL_TIMER_LABEL_COLOR = '#f5f8ff';
const DEFAULT_DUEL_CHARACTER_NAME_COLOR = '#f5f8ff';
const DEFAULT_DUEL_FIGHTER_PSEUDO_COLOR = '#f5f8ff';
const DEFAULT_DUEL_TEXT_SHADOW = {
  enabled: true,
  color: '#000000',
  blurPx: 12,
  offsetXPx: 0,
  offsetYPx: 3,
};
const DEFAULT_DUEL_FONT_SIZES = {
  timerValuePx: 48,
  timerLabelPx: 24,
  characterNamePx: 58,
  fighterPseudoPx: 28,
};
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
const TIMER_SECOND_MS = 1000;

let tournamentCache = null;
let currentMatchIndex = 0;
let currentImageHeightPx = DEFAULT_DUEL_IMAGE_HEIGHT_PX;
let currentImageOffsetXPx = DEFAULT_DUEL_IMAGE_OFFSET_X_PX;
let currentImageOffsetYPx = DEFAULT_DUEL_IMAGE_OFFSET_Y_PX;
let currentTextColor = DEFAULT_DUEL_TEXT_COLOR;
let currentTimerTextColor = DEFAULT_DUEL_TIMER_TEXT_COLOR;
let currentTimerLabelColor = DEFAULT_DUEL_TIMER_LABEL_COLOR;
let currentCharacterNameColor = DEFAULT_DUEL_CHARACTER_NAME_COLOR;
let currentFighterPseudoColor = DEFAULT_DUEL_FIGHTER_PSEUDO_COLOR;
let currentTextShadow = DEFAULT_DUEL_TEXT_SHADOW;
let currentFontSizes = DEFAULT_DUEL_FONT_SIZES;
let currentTimerOffsetYPx = DEFAULT_DUEL_TIMER_OFFSET_Y_PX;
let currentTimerProfile = DEFAULT_TIMER_PROFILE;
let currentTimer = null;
const pageParams = new URLSearchParams(window.location.search);
const activeProductRefs = getProductRefsBySlug(pageParams.get('product'), pageParams.get('profile'));

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

function sanitizeColor(value, fallback) {
  const normalized = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : fallback;
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

function normalizeTextShadow(value = {}) {
  return {
    enabled: sanitizeBoolean(value.enabled, DEFAULT_DUEL_TEXT_SHADOW.enabled),
    color: sanitizeColor(value.color, DEFAULT_DUEL_TEXT_SHADOW.color),
    blurPx: sanitizeRange(value.blurPx, DEFAULT_DUEL_TEXT_SHADOW.blurPx, 0, 80),
    offsetXPx: sanitizeRange(value.offsetXPx, DEFAULT_DUEL_TEXT_SHADOW.offsetXPx, -30, 30),
    offsetYPx: sanitizeRange(value.offsetYPx, DEFAULT_DUEL_TEXT_SHADOW.offsetYPx, -30, 30),
  };
}

function normalizeFontSizes(value = {}) {
  return {
    timerValuePx: sanitizeRange(value.timerValuePx, DEFAULT_DUEL_FONT_SIZES.timerValuePx, 12, 120),
    timerLabelPx: sanitizeRange(value.timerLabelPx, DEFAULT_DUEL_FONT_SIZES.timerLabelPx, 10, 90),
    characterNamePx: sanitizeRange(value.characterNamePx, DEFAULT_DUEL_FONT_SIZES.characterNamePx, 12, 140),
    fighterPseudoPx: sanitizeRange(value.fighterPseudoPx, DEFAULT_DUEL_FONT_SIZES.fighterPseudoPx, 10, 100),
  };
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

function sanitizeInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.round(parsed);
}

function normalizeTimerHealthConfig(value = {}) {
  return {
    enabled: sanitizeBoolean(value.enabled, DEFAULT_TIMER_HEALTH_CONFIG.enabled),
    barHeightPx: sanitizeInteger(value.barHeightPx, DEFAULT_TIMER_HEALTH_CONFIG.barHeightPx),
    barWidthPercent: sanitizeInteger(value.barWidthPercent, DEFAULT_TIMER_HEALTH_CONFIG.barWidthPercent),
    mainColor: sanitizeColor(value.mainColor, DEFAULT_TIMER_HEALTH_CONFIG.mainColor),
    warningColor: sanitizeColor(value.warningColor, DEFAULT_TIMER_HEALTH_CONFIG.warningColor),
    dangerColor: sanitizeColor(value.dangerColor, DEFAULT_TIMER_HEALTH_CONFIG.dangerColor),
    animationIntensity: sanitizeRange(value.animationIntensity, DEFAULT_TIMER_HEALTH_CONFIG.animationIntensity, 0, 100),
    dangerEffects: sanitizeBoolean(value.dangerEffects, DEFAULT_TIMER_HEALTH_CONFIG.dangerEffects),
  };
}

function normalizeTimerState(timerValue = {}) {
  const normalized = normalizeSharedTimerState(timerValue);

  return {
    ...normalized,
    initialSeconds: Number.isFinite(Number(normalized.initialSeconds))
      ? Math.max(10, Math.min(7200, Math.round(Number(normalized.initialSeconds))))
      : DEFAULT_TIMER_INITIAL_SECONDS,
    participant1Label: sanitizeTimerLabel(normalized.participant1Label, DEFAULT_TIMER_LABEL_1),
    participant2Label: sanitizeTimerLabel(normalized.participant2Label, DEFAULT_TIMER_LABEL_2),
    profile: sanitizeTimerProfile(normalized.profile),
    healthConfig: normalizeTimerHealthConfig(normalized.healthConfig),
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

function getHealthColor(remainingRatio, healthConfig = DEFAULT_TIMER_HEALTH_CONFIG) {
  if (remainingRatio <= 0.25) {
    return healthConfig.dangerColor;
  }
  if (remainingRatio <= 0.55) {
    return healthConfig.warningColor;
  }
  return healthConfig.mainColor;
}

function applyHealthBar(fillNode, remainingMs, initialMs, healthConfig) {
  if (!fillNode) {
    return;
  }

  const ratio = initialMs > 0 ? Math.max(0, Math.min(1, remainingMs / initialMs)) : 0;
  fillNode.style.setProperty('--timer-health-ratio', ratio.toFixed(4));
  fillNode.style.setProperty('--timer-health-color', getHealthColor(ratio, healthConfig));
}

function render() {
  const overlayMatches = getOverlayMatches(tournamentCache);
  const safeIndex = Math.max(0, Math.min(currentMatchIndex, Math.max(overlayMatches.length - 1, 0)));
  const match = overlayMatches[safeIndex];

  leftFighter.innerHTML = fighterMarkup(match?.left);
  rightFighter.innerHTML = fighterMarkup(match?.right);
  const resolvedTimer = normalizeTimerState({
    ...currentTimer,
    profile: currentTimerProfile,
  });

  if (duelView) {
    duelView.style.setProperty('--fighter-image-height', `${currentImageHeightPx}px`);
    duelView.style.setProperty('--fighter-offset-x', `${currentImageOffsetXPx}px`);
    duelView.style.setProperty('--fighter-offset-y', `${currentImageOffsetYPx}px`);
    duelView.style.setProperty('--fighter-text-color', currentTextColor);
    duelView.style.setProperty('--fighter-character-color', currentCharacterNameColor);
    duelView.style.setProperty('--fighter-name-color', currentFighterPseudoColor);
    duelView.style.setProperty('--character-font-size', `${currentFontSizes.characterNamePx}px`);
    duelView.style.setProperty('--fighter-name-font-size', `${currentFontSizes.fighterPseudoPx}px`);
    const textShadowValue = currentTextShadow.enabled
      ? `${currentTextShadow.offsetXPx}px ${currentTextShadow.offsetYPx}px ${currentTextShadow.blurPx}px ${currentTextShadow.color}`
      : 'none';
    duelView.style.setProperty('--overlay-text-shadow', textShadowValue);
  }
  if (duelTimers) {
    duelTimers.style.setProperty('--duel-timer-offset-y', `${currentTimerOffsetYPx}px`);
    duelTimers.style.setProperty('--timer-value-color', currentTimerTextColor);
    duelTimers.style.setProperty('--timer-label-color', currentTimerLabelColor);
    duelTimers.style.setProperty('--timer-value-font-size', `${currentFontSizes.timerValuePx}px`);
    duelTimers.style.setProperty('--timer-label-font-size', `${currentFontSizes.timerLabelPx}px`);
    duelTimers.style.setProperty(
      '--overlay-text-shadow',
      currentTextShadow.enabled
        ? `${currentTextShadow.offsetXPx}px ${currentTextShadow.offsetYPx}px ${currentTextShadow.blurPx}px ${currentTextShadow.color}`
        : 'none',
    );
    const useHealthProfile = resolvedTimer.profile === 'healthbar' && resolvedTimer.healthConfig.enabled;
    duelTimers.classList.toggle('timer-profile-health', useHealthProfile);
    duelTimers.style.setProperty('--health-bar-height', `${resolvedTimer.healthConfig.barHeightPx}px`);
    duelTimers.style.setProperty('--health-bar-width', `${resolvedTimer.healthConfig.barWidthPercent}%`);
    duelTimers.style.setProperty('--health-bar-color-main', resolvedTimer.healthConfig.mainColor);
    duelTimers.style.setProperty('--health-bar-color-warning', resolvedTimer.healthConfig.warningColor);
    duelTimers.style.setProperty('--health-bar-color-danger', resolvedTimer.healthConfig.dangerColor);
    duelTimers.style.setProperty('--health-anim-intensity', `${resolvedTimer.healthConfig.animationIntensity / 100}`);
  }
  if (timerP1Value) {
    timerP1Value.textContent = formatTimer(resolvedTimer.participant1.remainingMs);
  }
  if (timerP2Value) {
    timerP2Value.textContent = formatTimer(resolvedTimer.participant2.remainingMs);
  }
  if (timerP1Label) {
    timerP1Label.textContent = resolvedTimer.participant1Label;
  }
  if (timerP2Label) {
    timerP2Label.textContent = resolvedTimer.participant2Label;
  }

  if (timerParticipant1 && timerParticipant2) {
    timerParticipant1.classList.toggle('active', resolvedTimer.activeParticipant === 1 && resolvedTimer.participant1.isRunning);
    timerParticipant2.classList.toggle('active', resolvedTimer.activeParticipant === 2 && resolvedTimer.participant2.isRunning);
  }

  const initialMs = resolvedTimer.initialSeconds * TIMER_SECOND_MS;
  const ratioP1 = initialMs > 0 ? Math.max(0, Math.min(1, resolvedTimer.participant1.remainingMs / initialMs)) : 0;
  const ratioP2 = initialMs > 0 ? Math.max(0, Math.min(1, resolvedTimer.participant2.remainingMs / initialMs)) : 0;
  const dangerMode = resolvedTimer.healthConfig.dangerEffects && (ratioP1 <= 0.2 || ratioP2 <= 0.2);

  applyHealthBar(timerP1HealthFill, resolvedTimer.participant1.remainingMs, initialMs, resolvedTimer.healthConfig);
  applyHealthBar(timerP2HealthFill, resolvedTimer.participant2.remainingMs, initialMs, resolvedTimer.healthConfig);
  applyHealthBar(timerP1HealthTrail, resolvedTimer.participant1.remainingMs, initialMs, resolvedTimer.healthConfig);
  applyHealthBar(timerP2HealthTrail, resolvedTimer.participant2.remainingMs, initialMs, resolvedTimer.healthConfig);

  if (timerCenterValue) {
    timerCenterValue.textContent = 'VS';
  }
  if (duelTimers) {
    duelTimers.dataset.danger = dangerMode ? 'true' : 'false';
  }
}

onValue(activeProductRefs.matchesRef, (snapshot) => {
  tournamentCache = normalizeTournament(snapshot.val());
  render();
});

onValue(activeProductRefs.overlayRef, (snapshot) => {
  const value = snapshot.val() || {};
  currentMatchIndex = Number(value.matchIndex || 0);
  currentImageHeightPx = sanitizeDuelImageHeight(value.imageHeightPx);
  currentImageOffsetXPx = sanitizeDuelImageOffsetX(value.imageOffsetXPx);
  currentImageOffsetYPx = sanitizeDuelImageOffsetY(value.imageOffsetYPx);
  currentTextColor = sanitizeTextColor(value.textColor);
  currentTimerTextColor = sanitizeColor(value.timerTextColor, DEFAULT_DUEL_TIMER_TEXT_COLOR);
  currentTimerLabelColor = sanitizeColor(value.timerLabelColor, DEFAULT_DUEL_TIMER_LABEL_COLOR);
  currentCharacterNameColor = sanitizeColor(value.characterNameColor, DEFAULT_DUEL_CHARACTER_NAME_COLOR);
  currentFighterPseudoColor = sanitizeColor(value.fighterPseudoColor, DEFAULT_DUEL_FIGHTER_PSEUDO_COLOR);
  currentTextShadow = normalizeTextShadow(value.textShadow);
  currentFontSizes = normalizeFontSizes(value.fontSizes);
  currentTimerOffsetYPx = sanitizeDuelTimerOffsetY(value.timerOffsetYPx);
  currentTimerProfile = sanitizeTimerProfile(value.timerProfile ?? value.timer?.profile);
  currentTimer = normalizeTimerState(value.timer);
  render();
});
