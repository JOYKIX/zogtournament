export const TIMER_STATUS = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  FINISHED: 'finished',
});

function sanitizeStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === TIMER_STATUS.RUNNING || normalized === TIMER_STATUS.FINISHED) {
    return normalized;
  }
  return TIMER_STATUS.IDLE;
}

export function getRemainingTime(state, now = Date.now()) {
  if (!state || typeof state !== 'object') {
    return 0;
  }

  if (sanitizeStatus(state.status) === TIMER_STATUS.FINISHED) {
    return 0;
  }

  const remainingMs = Math.max(0, Math.round(Number(state.remainingMs) || 0));
  const lastUpdatedAt = Number(state.lastUpdatedAt || now);
  if (!Boolean(state.isRunning)) {
    return remainingMs;
  }

  const elapsed = Math.max(0, now - lastUpdatedAt);
  return Math.max(0, remainingMs - elapsed);
}

export function resolveTimerStatus(timer) {
  const status = sanitizeStatus(timer?.status);
  if (status === TIMER_STATUS.FINISHED) {
    return TIMER_STATUS.FINISHED;
  }

  return Boolean(timer?.isRunning && timer?.activeParticipant) ? TIMER_STATUS.RUNNING : TIMER_STATUS.IDLE;
}
