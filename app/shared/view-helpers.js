export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function normalizeImageUrl(url, fallback) {
  const raw = String(url || '').trim();
  if (!raw || !/^https?:\/\//i.test(raw)) {
    return fallback;
  }

  return raw;
}
