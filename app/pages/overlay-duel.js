import { matchesRef, onValue, overlayRef } from '../shared/firebase.js';
import { getOverlayMatches, normalizeTournament } from '../shared/tournament.js';
import { escapeHtml, normalizeImageUrl } from '../shared/view-helpers.js';
import { GuestCamOverlayReceiver } from '../webrtc/overlay-room.js';

const leftFighter = document.getElementById('leftFighter');
const rightFighter = document.getElementById('rightFighter');
const duelView = document.querySelector('.duel-view');
const duelTimers = document.querySelector('.duel-timers');
const guestCamsLayer = document.querySelector('.guest-cams-layer');
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
const guestSlot1 = document.getElementById('guestSlot1');
const guestSlot2 = document.getElementById('guestSlot2');
const guestSlot3 = document.getElementById('guestSlot3');
const guestVideo1 = document.getElementById('guestVideo1');
const guestVideo2 = document.getElementById('guestVideo2');
const guestVideo3 = document.getElementById('guestVideo3');
const guestAudio1 = document.getElementById('guestAudio1');
const guestAudio2 = document.getElementById('guestAudio2');
const guestAudio3 = document.getElementById('guestAudio3');

const DEFAULT_DUEL_IMAGE_HEIGHT_PX = 760;
const DEFAULT_DUEL_IMAGE_OFFSET_X_PX = 18;
const DEFAULT_DUEL_IMAGE_OFFSET_Y_PX = 0;
const DEFAULT_DUEL_TEXT_COLOR = '#f5f8ff';
const DEFAULT_GUEST_CAM_OFFSET_Y_PX = 0;
const DEFAULT_GUEST_CAM_WIDTH_PX = 320;
const DEFAULT_GUEST_CAM_HEIGHT_PX = 180;
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
let currentGuestCamOffsetYPx = DEFAULT_GUEST_CAM_OFFSET_Y_PX;
let currentGuestCamWidthPx = DEFAULT_GUEST_CAM_WIDTH_PX;
let currentGuestCamHeightPx = DEFAULT_GUEST_CAM_HEIGHT_PX;
let currentTimerOffsetYPx = DEFAULT_DUEL_TIMER_OFFSET_Y_PX;
let currentTimerProfile = DEFAULT_TIMER_PROFILE;
let currentTimer = null;
const slotNodes = {
  slot1: { wrapper: guestSlot1, video: guestVideo1, audio: guestAudio1 },
  slot2: { wrapper: guestSlot2, video: guestVideo2, audio: guestAudio2 },
  slot3: { wrapper: guestSlot3, video: guestVideo3, audio: guestAudio3 },
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

function sanitizeGuestCamOffsetY(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_GUEST_CAM_OFFSET_Y_PX;
  }

  return Math.round(parsed);
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

function sanitizeColor(value, fallback) {
  const normalized = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : fallback;
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
  const profile = sanitizeTimerProfile(timerValue.profile);
  const healthConfig = normalizeTimerHealthConfig(timerValue.healthConfig);

  return {
    initialSeconds: safeInitialSeconds,
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
  }
  if (guestCamsLayer) {
    guestCamsLayer.style.setProperty('--guest-cams-offset-y', `${currentGuestCamOffsetYPx}px`);
    guestCamsLayer.style.setProperty('--guest-cam-width-px', `${currentGuestCamWidthPx}px`);
    guestCamsLayer.style.setProperty('--guest-cam-height-px', `${currentGuestCamHeightPx}px`);
  }
  if (duelTimers) {
    duelTimers.style.setProperty('--duel-timer-offset-y', `${currentTimerOffsetYPx}px`);
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

  const initialMs = resolvedTimer.initialSeconds * TIMER_SECOND_MS;
  const ratioP1 = initialMs > 0 ? Math.max(0, Math.min(1, resolvedTimer.participant1Ms / initialMs)) : 0;
  const ratioP2 = initialMs > 0 ? Math.max(0, Math.min(1, resolvedTimer.participant2Ms / initialMs)) : 0;
  const dangerMode = resolvedTimer.healthConfig.dangerEffects && (ratioP1 <= 0.2 || ratioP2 <= 0.2);

  applyHealthBar(timerP1HealthFill, resolvedTimer.participant1Ms, initialMs, resolvedTimer.healthConfig);
  applyHealthBar(timerP2HealthFill, resolvedTimer.participant2Ms, initialMs, resolvedTimer.healthConfig);
  applyHealthBar(timerP1HealthTrail, resolvedTimer.participant1Ms, initialMs, resolvedTimer.healthConfig);
  applyHealthBar(timerP2HealthTrail, resolvedTimer.participant2Ms, initialMs, resolvedTimer.healthConfig);

  if (timerCenterValue) {
    timerCenterValue.textContent = 'VS';
  }
  if (duelTimers) {
    duelTimers.dataset.danger = dangerMode ? 'true' : 'false';
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
  currentImageOffsetXPx = sanitizeDuelImageOffsetX(value.imageOffsetXPx);
  currentImageOffsetYPx = sanitizeDuelImageOffsetY(value.imageOffsetYPx);
  currentTextColor = sanitizeTextColor(value.textColor);
  currentGuestCamOffsetYPx = sanitizeGuestCamOffsetY(value.guestCamOffsetYPx);
  currentGuestCamWidthPx = sanitizeGuestCamWidth(value.guestCamWidthPx);
  currentGuestCamHeightPx = sanitizeGuestCamHeight(value.guestCamHeightPx);
  currentTimerOffsetYPx = sanitizeDuelTimerOffsetY(value.timerOffsetYPx);
  currentTimerProfile = sanitizeTimerProfile(value.timerProfile ?? value.timer?.profile);
  currentTimer = normalizeTimerState(value.timer);
  render();
});

const overlayReceiver = new GuestCamOverlayReceiver({
  onSlotUpdate: (slotId, stream, isVisible, meta = {}) => {
    const slot = slotNodes[slotId];
    if (!slot?.wrapper || !slot.video || !slot.audio) {
      return;
    }

    slot.wrapper.classList.toggle('is-visible', Boolean(isVisible));
    slot.video.srcObject = stream || null;
    slot.video.muted = true;
    slot.audio.srcObject = stream || null;
    slot.audio.muted = !meta.includeOverlayAudio;
    slot.audio.volume = meta.includeOverlayAudio ? 1 : 0;

    if (!stream) {
      return;
    }

    slot.video.play().catch(() => {
      // Certains navigateurs bloquent l'autoplay vidéo sans interaction utilisateur.
    });
    slot.audio.play().catch(() => {
      // Certains navigateurs bloquent l'autoplay audio sans interaction utilisateur.
    });
  },
  onLog: (message) => {
    console.log('[OverlayCam]', message);
  },
});
overlayReceiver.start();

window.addEventListener('beforeunload', () => {
  overlayReceiver.stop();
});
