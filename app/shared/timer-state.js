export const TIMER_STATUS = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  FINISHED: 'finished',
});

const MIN_INITIAL_SECONDS = 10;
const MAX_INITIAL_SECONDS = 7200;
const DEFAULT_INITIAL_SECONDS = 300;
const TIMER_SECOND_MS = 1000;

function sanitizeStatus(value, fallback = TIMER_STATUS.IDLE) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === TIMER_STATUS.RUNNING || normalized === TIMER_STATUS.FINISHED || normalized === TIMER_STATUS.IDLE) {
    return normalized;
  }
  return fallback;
}

function sanitizeInitialSeconds(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_INITIAL_SECONDS;
  }
  return Math.max(MIN_INITIAL_SECONDS, Math.min(MAX_INITIAL_SECONDS, Math.round(parsed)));
}

function sanitizeParticipant(value) {
  return value === 1 || value === 2 ? value : null;
}

function sanitizeTimestamp(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeTimerPlayer(playerValue, initialMs, now) {
  const remainingRaw = Number(playerValue?.remainingMs);
  const remainingMs = Math.max(0, Math.round(Number.isFinite(remainingRaw) ? remainingRaw : initialMs));
  const lastUpdatedAt = sanitizeTimestamp(playerValue?.lastUpdatedAt, now);
  const startedAt = sanitizeTimestamp(playerValue?.startedAt, null);
  const rawEndsAt = sanitizeTimestamp(playerValue?.endsAt, null);
  const status = sanitizeStatus(playerValue?.status, remainingMs <= 0 ? TIMER_STATUS.FINISHED : TIMER_STATUS.IDLE);
  const isRunning = Boolean(playerValue?.isRunning && status !== TIMER_STATUS.FINISHED && remainingMs > 0);
  const endsAt = isRunning ? rawEndsAt || lastUpdatedAt + remainingMs : null;

  if (remainingMs <= 0) {
    return {
      remainingMs: 0,
      lastUpdatedAt,
      startedAt,
      endsAt: null,
      status: TIMER_STATUS.FINISHED,
      isRunning: false,
    };
  }

  return {
    remainingMs,
    lastUpdatedAt,
    startedAt: isRunning ? startedAt || lastUpdatedAt : startedAt,
    endsAt,
    status: isRunning ? TIMER_STATUS.RUNNING : status,
    isRunning,
  };
}

function resolveGlobalStatus(timer) {
  const p1 = timer.participant1;
  const p2 = timer.participant2;

  if (p1.status === TIMER_STATUS.FINISHED && p2.status === TIMER_STATUS.FINISHED) {
    return TIMER_STATUS.FINISHED;
  }
  if (p1.isRunning || p2.isRunning) {
    return TIMER_STATUS.RUNNING;
  }
  return TIMER_STATUS.IDLE;
}

export function normalizeTimerState(timerValue = {}, now = Date.now()) {
  const initialSeconds = sanitizeInitialSeconds(timerValue.initialSeconds);
  const initialMs = initialSeconds * TIMER_SECOND_MS;
  const participant1 = normalizeTimerPlayer(timerValue.participant1, initialMs, now);
  const participant2 = normalizeTimerPlayer(timerValue.participant2, initialMs, now);
  const activeParticipant = sanitizeParticipant(timerValue.activeParticipant);

  if (activeParticipant === 1 && !participant1.isRunning) {
    participant1.isRunning = participant1.remainingMs > 0 && participant1.status !== TIMER_STATUS.FINISHED;
    participant1.status = participant1.isRunning ? TIMER_STATUS.RUNNING : participant1.status;
  }
  if (activeParticipant === 2 && !participant2.isRunning) {
    participant2.isRunning = participant2.remainingMs > 0 && participant2.status !== TIMER_STATUS.FINISHED;
    participant2.status = participant2.isRunning ? TIMER_STATUS.RUNNING : participant2.status;
  }

  if (participant1.isRunning && participant2.isRunning) {
    if (activeParticipant === 1) {
      participant2.isRunning = false;
      participant2.status = participant2.remainingMs <= 0 ? TIMER_STATUS.FINISHED : TIMER_STATUS.IDLE;
    } else {
      participant1.isRunning = false;
      participant1.status = participant1.remainingMs <= 0 ? TIMER_STATUS.FINISHED : TIMER_STATUS.IDLE;
    }
  }

  const safeActiveParticipant =
    activeParticipant && (activeParticipant === 1 ? participant1.isRunning : participant2.isRunning) ? activeParticipant : null;

  return {
    initialSeconds,
    participant1,
    participant2,
    participant1Label: String(timerValue.participant1Label || '').trim() || 'Joueur 1',
    participant2Label: String(timerValue.participant2Label || '').trim() || 'Joueur 2',
    profile: String(timerValue.profile || '').trim() || 'classic',
    healthConfig: timerValue.healthConfig && typeof timerValue.healthConfig === 'object' ? timerValue.healthConfig : {},
    activeParticipant: safeActiveParticipant,
    status: sanitizeStatus(timerValue.status, resolveGlobalStatus({ participant1, participant2 })),
    updatedAt: Number(timerValue.updatedAt || now),
  };
}

export function getRemainingTime(state, now = Date.now()) {
  if (!state || typeof state !== 'object') {
    return 0;
  }

  const remainingMs = Math.max(0, Math.round(Number(state.remainingMs) || 0));
  if (!Boolean(state.isRunning) || sanitizeStatus(state.status) === TIMER_STATUS.FINISHED) {
    return remainingMs;
  }

  const endsAt = sanitizeTimestamp(state.endsAt, null);
  if (endsAt) {
    return Math.max(0, Math.ceil(endsAt - now));
  }

  const lastUpdatedAt = sanitizeTimestamp(state.lastUpdatedAt, now);
  const elapsed = Math.max(0, now - lastUpdatedAt);
  return Math.max(0, remainingMs - elapsed);
}

function tickPlayer(player, now) {
  if (!player.isRunning) {
    return player;
  }

  const remainingMs = getRemainingTime(player, now);
  if (remainingMs <= 0) {
    return {
      ...player,
      remainingMs: 0,
      lastUpdatedAt: now,
      endsAt: null,
      isRunning: false,
      status: TIMER_STATUS.FINISHED,
    };
  }

  return {
    ...player,
    remainingMs,
    lastUpdatedAt: now,
    endsAt: player.endsAt || now + remainingMs,
    isRunning: true,
    status: TIMER_STATUS.RUNNING,
  };
}

export function tickTimerState(timerValue, now = Date.now()) {
  const timer = normalizeTimerState(timerValue, now);
  const participant1 = tickPlayer(timer.participant1, now);
  const participant2 = tickPlayer(timer.participant2, now);

  let activeParticipant = timer.activeParticipant;
  if (activeParticipant === 1 && !participant1.isRunning) {
    activeParticipant = null;
  }
  if (activeParticipant === 2 && !participant2.isRunning) {
    activeParticipant = null;
  }

  const nextTimer = {
    ...timer,
    participant1,
    participant2,
    activeParticipant,
    updatedAt: now,
  };

  return {
    ...nextTimer,
    status: resolveGlobalStatus(nextTimer),
  };
}

export function resetTimerState(timerValue, now = Date.now(), labels = null) {
  const timer = normalizeTimerState(timerValue, now);
  const initialMs = timer.initialSeconds * TIMER_SECOND_MS;
  return {
    ...timer,
    participant1: {
      remainingMs: initialMs,
      lastUpdatedAt: now,
      startedAt: null,
      endsAt: null,
      status: TIMER_STATUS.IDLE,
      isRunning: false,
    },
    participant2: {
      remainingMs: initialMs,
      lastUpdatedAt: now,
      startedAt: null,
      endsAt: null,
      status: TIMER_STATUS.IDLE,
      isRunning: false,
    },
    participant1Label: String(labels?.participant1Label || timer.participant1Label || 'Joueur 1').trim() || 'Joueur 1',
    participant2Label: String(labels?.participant2Label || timer.participant2Label || 'Joueur 2').trim() || 'Joueur 2',
    activeParticipant: null,
    status: TIMER_STATUS.IDLE,
    updatedAt: now,
  };
}

export function startTimerForParticipant(timerValue, participant, now = Date.now()) {
  const timer = tickTimerState(timerValue, now);
  const requestedTarget = participant === 2 ? 2 : 1;
  const requestedKey = requestedTarget === 1 ? 'participant1' : 'participant2';
  const alternateTarget = requestedTarget === 1 ? 2 : 1;
  const alternateKey = alternateTarget === 1 ? 'participant1' : 'participant2';

  const requestedHasTime =
    timer[requestedKey].status !== TIMER_STATUS.FINISHED && timer[requestedKey].remainingMs > 0;
  const alternateHasTime =
    timer[alternateKey].status !== TIMER_STATUS.FINISHED && timer[alternateKey].remainingMs > 0;

  let target = requestedTarget;
  if (!requestedHasTime && alternateHasTime) {
    target = alternateTarget;
  }

  const key = target === 1 ? 'participant1' : 'participant2';
  const otherKey = target === 1 ? 'participant2' : 'participant1';

  if (timer[key].status === TIMER_STATUS.FINISHED || timer[key].remainingMs <= 0) {
    return timer;
  }

  return {
    ...timer,
    [key]: {
      ...timer[key],
      isRunning: true,
      status: TIMER_STATUS.RUNNING,
      lastUpdatedAt: now,
      startedAt: timer[key].startedAt || now,
      endsAt: now + timer[key].remainingMs,
    },
    [otherKey]: {
      ...timer[otherKey],
      isRunning: false,
      status: timer[otherKey].remainingMs <= 0 ? TIMER_STATUS.FINISHED : TIMER_STATUS.IDLE,
      lastUpdatedAt: now,
      endsAt: null,
    },
    activeParticipant: target,
    status: TIMER_STATUS.RUNNING,
    updatedAt: now,
  };
}

export function stopTimerState(timerValue, now = Date.now()) {
  const timer = tickTimerState(timerValue, now);
  return {
    ...timer,
    participant1: {
      ...timer.participant1,
      isRunning: false,
      status: timer.participant1.remainingMs <= 0 ? TIMER_STATUS.FINISHED : TIMER_STATUS.IDLE,
      lastUpdatedAt: now,
      endsAt: null,
    },
    participant2: {
      ...timer.participant2,
      isRunning: false,
      status: timer.participant2.remainingMs <= 0 ? TIMER_STATUS.FINISHED : TIMER_STATUS.IDLE,
      lastUpdatedAt: now,
      endsAt: null,
    },
    activeParticipant: null,
    status: resolveGlobalStatus({
      participant1: { ...timer.participant1, isRunning: false },
      participant2: { ...timer.participant2, isRunning: false },
    }),
    updatedAt: now,
  };
}

export function switchTimerParticipant(timerValue, now = Date.now()) {
  const timer = tickTimerState(timerValue, now);
  if (!timer.activeParticipant) {
    return timer;
  }

  const nextParticipant = timer.activeParticipant === 1 ? 2 : 1;
  return startTimerForParticipant(timer, nextParticipant, now);
}

export function resolveTimerStatus(timer) {
  return normalizeTimerState(timer).status;
}
