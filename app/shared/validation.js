export const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,24}$/;

export function normalizeCode(value) {
  return String(value || '').trim().toUpperCase();
}

export function normalizePseudo(value) {
  return String(value || '').trim();
}

export function isValidPseudo(value) {
  return USERNAME_REGEX.test(normalizePseudo(value));
}
