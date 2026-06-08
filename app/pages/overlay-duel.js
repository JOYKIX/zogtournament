import { get, getAuthRefs, getProductRefsBySlug, onValue } from '../shared/firebase.js';
import { getOverlayMatches, normalizeTournament } from '../shared/tournament.js';
import { escapeHtml, normalizeImageUrl } from '../shared/view-helpers.js';
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
  DEFAULT_TIMER_PROFILE,
  normalizeDuelFontSizes,
  normalizeDuelTextShadow,
  normalizeDuelTimerState,
  sanitizeColor,
  sanitizeDuelImageHeight,
  sanitizeDuelImageOffsetX,
  sanitizeDuelImageOffsetY,
  sanitizeDuelTimerOffsetY,
  sanitizeTextColor,
  sanitizeTimerProfile,
} from '../shared/duel-overlay-settings.js';

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
let currentTextShadow = { ...DEFAULT_DUEL_TEXT_SHADOW };
let currentFontSizes = { ...DEFAULT_DUEL_FONT_SIZES };
let currentTimerOffsetYPx = DEFAULT_DUEL_TIMER_OFFSET_Y_PX;
let currentTimerProfile = DEFAULT_TIMER_PROFILE;
let currentTimer = null;
const pageParams = new URLSearchParams(window.location.search);

async function resolveActiveProductRefs() {
  const productSlug = pageParams.get('product') || 'tournament';
  const profileId = String(pageParams.get('profile') || '').trim();

  if (profileId) {
    return getProductRefsBySlug(productSlug, profileId);
  }

  const profileSnapshot = await get(getAuthRefs().profileRef);
  const fallbackProfileId = String(profileSnapshot.val()?.uid || '').trim();

  if (!fallbackProfileId) {
    return getProductRefsBySlug(productSlug);
  }

  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('product', productSlug);
  nextUrl.searchParams.set('profile', fallbackProfileId);
  window.history.replaceState(null, '', nextUrl.toString());

  return getProductRefsBySlug(productSlug, fallbackProfileId);
}

const activeProductRefs = await resolveActiveProductRefs();

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
    return 0;
  }

  const ratio = initialMs > 0 ? Math.max(0, Math.min(1, remainingMs / initialMs)) : 0;
  fillNode.style.setProperty('--timer-health-ratio', ratio.toFixed(4));
  fillNode.style.setProperty('--timer-health-color', getHealthColor(ratio, healthConfig));
  return ratio;
}

function render() {
  const overlayMatches = getOverlayMatches(tournamentCache);
  const safeIndex = Math.max(0, Math.min(currentMatchIndex, Math.max(overlayMatches.length - 1, 0)));
  const match = overlayMatches[safeIndex];

  leftFighter.innerHTML = fighterMarkup(match?.left);
  rightFighter.innerHTML = fighterMarkup(match?.right);
  const resolvedTimer = normalizeDuelTimerState({
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
  const ratioP1 = applyHealthBar(timerP1HealthFill, resolvedTimer.participant1.remainingMs, initialMs, resolvedTimer.healthConfig);
  const ratioP2 = applyHealthBar(timerP2HealthFill, resolvedTimer.participant2.remainingMs, initialMs, resolvedTimer.healthConfig);
  applyHealthBar(timerP1HealthTrail, resolvedTimer.participant1.remainingMs, initialMs, resolvedTimer.healthConfig);
  applyHealthBar(timerP2HealthTrail, resolvedTimer.participant2.remainingMs, initialMs, resolvedTimer.healthConfig);

  const dangerP1 = resolvedTimer.healthConfig.dangerEffects && ratioP1 <= 0.2;
  const dangerP2 = resolvedTimer.healthConfig.dangerEffects && ratioP2 <= 0.2;
  const dangerMode = dangerP1 || dangerP2;

  timerParticipant1?.classList.toggle('health-danger', dangerP1);
  timerParticipant2?.classList.toggle('health-danger', dangerP2);

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
  currentTextShadow = normalizeDuelTextShadow(value.textShadow);
  currentFontSizes = normalizeDuelFontSizes(value.fontSizes);
  currentTimerOffsetYPx = sanitizeDuelTimerOffsetY(value.timerOffsetYPx);
  currentTimerProfile = sanitizeTimerProfile(value.timerProfile ?? value.timer?.profile);
  currentTimer = normalizeDuelTimerState(value.timer);
  render();
});
