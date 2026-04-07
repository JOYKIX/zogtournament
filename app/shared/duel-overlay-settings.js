import { normalizeTimerState as normalizeSharedTimerState } from './timer-state.js';

export const DEFAULT_DUEL_IMAGE_HEIGHT_PX = 760;
export const DEFAULT_DUEL_IMAGE_OFFSET_X_PX = 18;
export const DEFAULT_DUEL_IMAGE_OFFSET_Y_PX = 0;
export const DEFAULT_DUEL_TEXT_COLOR = '#f5f8ff';
export const DEFAULT_DUEL_TIMER_TEXT_COLOR = '#f5f8ff';
export const DEFAULT_DUEL_TIMER_LABEL_COLOR = '#f5f8ff';
export const DEFAULT_DUEL_CHARACTER_NAME_COLOR = '#f5f8ff';
export const DEFAULT_DUEL_FIGHTER_PSEUDO_COLOR = '#f5f8ff';
export const DEFAULT_DUEL_TEXT_SHADOW = Object.freeze({
  enabled: true,
  color: '#000000',
  blurPx: 12,
  offsetXPx: 0,
  offsetYPx: 3,
});
export const DEFAULT_DUEL_FONT_SIZES = Object.freeze({
  timerValuePx: 48,
  timerLabelPx: 24,
  characterNamePx: 58,
  fighterPseudoPx: 28,
});
export const DEFAULT_TIMER_INITIAL_SECONDS = 300;
export const DEFAULT_DUEL_TIMER_OFFSET_Y_PX = 0;
export const DEFAULT_TIMER_LABEL_1 = 'Joueur 1';
export const DEFAULT_TIMER_LABEL_2 = 'Joueur 2';
export const DEFAULT_TIMER_PROFILE = 'classic';
export const DEFAULT_TIMER_HEALTH_CONFIG = Object.freeze({
  enabled: true,
  barHeightPx: 26,
  barWidthPercent: 40,
  mainColor: '#3ef784',
  warningColor: '#ff9f1a',
  dangerColor: '#ff3a39',
  animationIntensity: 80,
  dangerEffects: true,
});

const MIN_TIMER_INITIAL_SECONDS = 10;
const MAX_TIMER_INITIAL_SECONDS = 7200;

export function sanitizeBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

export function sanitizeColor(value, fallback) {
  const normalized = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : fallback;
}

export function sanitizeTextColor(value) {
  return sanitizeColor(value, DEFAULT_DUEL_TEXT_COLOR);
}

export function sanitizeRange(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(parsed)));
}

export function sanitizeInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.round(parsed);
}

export function sanitizeDuelImageHeight(value) {
  return sanitizeInteger(value, DEFAULT_DUEL_IMAGE_HEIGHT_PX);
}

export function sanitizeDuelImageOffsetX(value) {
  return sanitizeInteger(value, DEFAULT_DUEL_IMAGE_OFFSET_X_PX);
}

export function sanitizeDuelImageOffsetY(value) {
  return sanitizeInteger(value, DEFAULT_DUEL_IMAGE_OFFSET_Y_PX);
}

export function sanitizeTimerInitialSeconds(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TIMER_INITIAL_SECONDS;
  }

  return Math.max(MIN_TIMER_INITIAL_SECONDS, Math.min(MAX_TIMER_INITIAL_SECONDS, Math.round(parsed)));
}

export function sanitizeDuelTimerOffsetY(value) {
  return sanitizeInteger(value, DEFAULT_DUEL_TIMER_OFFSET_Y_PX);
}

export function sanitizeTimerLabel(value, fallback) {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

export function sanitizeTimerProfile(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'healthbar' || normalized === 'fighting' || normalized === 'healthbars'
    ? 'healthbar'
    : DEFAULT_TIMER_PROFILE;
}

export function normalizeDuelTextShadow(value = {}) {
  return {
    enabled: sanitizeBoolean(value.enabled, DEFAULT_DUEL_TEXT_SHADOW.enabled),
    color: sanitizeColor(value.color, DEFAULT_DUEL_TEXT_SHADOW.color),
    blurPx: sanitizeRange(value.blurPx, DEFAULT_DUEL_TEXT_SHADOW.blurPx, 0, 80),
    offsetXPx: sanitizeRange(value.offsetXPx, DEFAULT_DUEL_TEXT_SHADOW.offsetXPx, -30, 30),
    offsetYPx: sanitizeRange(value.offsetYPx, DEFAULT_DUEL_TEXT_SHADOW.offsetYPx, -30, 30),
  };
}

export function normalizeDuelFontSizes(value = {}) {
  return {
    timerValuePx: sanitizeRange(value.timerValuePx, DEFAULT_DUEL_FONT_SIZES.timerValuePx, 12, 120),
    timerLabelPx: sanitizeRange(value.timerLabelPx, DEFAULT_DUEL_FONT_SIZES.timerLabelPx, 10, 90),
    characterNamePx: sanitizeRange(value.characterNamePx, DEFAULT_DUEL_FONT_SIZES.characterNamePx, 12, 140),
    fighterPseudoPx: sanitizeRange(value.fighterPseudoPx, DEFAULT_DUEL_FONT_SIZES.fighterPseudoPx, 10, 100),
  };
}

export function normalizeTimerHealthConfig(value = {}) {
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

export function normalizeDuelTimerState(timerValue = {}) {
  const normalized = normalizeSharedTimerState(timerValue);

  return {
    ...normalized,
    initialSeconds: sanitizeTimerInitialSeconds(normalized.initialSeconds),
    participant1Label: sanitizeTimerLabel(normalized.participant1Label, DEFAULT_TIMER_LABEL_1),
    participant2Label: sanitizeTimerLabel(normalized.participant2Label, DEFAULT_TIMER_LABEL_2),
    profile: sanitizeTimerProfile(normalized.profile),
    healthConfig: normalizeTimerHealthConfig(normalized.healthConfig),
  };
}

export function createDefaultOverlayStyleState() {
  return {
    imageHeightPx: DEFAULT_DUEL_IMAGE_HEIGHT_PX,
    imageOffsetXPx: DEFAULT_DUEL_IMAGE_OFFSET_X_PX,
    imageOffsetYPx: DEFAULT_DUEL_IMAGE_OFFSET_Y_PX,
    textColor: DEFAULT_DUEL_TEXT_COLOR,
    timerTextColor: DEFAULT_DUEL_TIMER_TEXT_COLOR,
    timerLabelColor: DEFAULT_DUEL_TIMER_LABEL_COLOR,
    characterNameColor: DEFAULT_DUEL_CHARACTER_NAME_COLOR,
    fighterPseudoColor: DEFAULT_DUEL_FIGHTER_PSEUDO_COLOR,
    textShadow: { ...DEFAULT_DUEL_TEXT_SHADOW },
    fontSizes: { ...DEFAULT_DUEL_FONT_SIZES },
    timerOffsetYPx: DEFAULT_DUEL_TIMER_OFFSET_Y_PX,
    timerProfile: DEFAULT_TIMER_PROFILE,
  };
}
