import { getProductRefsBySlug, onValue } from '../shared/firebase.js';

const params = new URLSearchParams(window.location.search);
const profileId = String(params.get('profile') || '').trim() || null;
const product = String(params.get('product') || 'quiz').trim().toLowerCase();
const activeProductRefs = getProductRefsBySlug(product, profileId);

const questionText = document.getElementById('questionText');
const qaZone = document.getElementById('qaZone');
const OVERLAY_WIDTH_PX = 1920;
const OVERLAY_HEIGHT_PX = 1080;
const DEFAULT_QA_RECT = { x1: 560, y1: 260, x2: 1360, y2: 760 };

function sanitizeCoord(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const rounded = Math.round(parsed);
  return Math.min(max, Math.max(min, rounded));
}

function normalizeQaRect(value) {
  const raw = value || {};
  const x1 = sanitizeCoord(raw.x1, DEFAULT_QA_RECT.x1, 0, OVERLAY_WIDTH_PX - 1);
  const y1 = sanitizeCoord(raw.y1, DEFAULT_QA_RECT.y1, 0, OVERLAY_HEIGHT_PX - 1);
  const x2Raw = sanitizeCoord(raw.x2, DEFAULT_QA_RECT.x2, 1, OVERLAY_WIDTH_PX);
  const y2Raw = sanitizeCoord(raw.y2, DEFAULT_QA_RECT.y2, 1, OVERLAY_HEIGHT_PX);
  const x2 = Math.max(x1 + 1, x2Raw);
  const y2 = Math.max(y1 + 1, y2Raw);
  return { x1, y1, x2, y2 };
}

function applyQaRect(rectValue) {
  if (!qaZone) {
    return;
  }
  const rect = normalizeQaRect(rectValue);
  qaZone.style.left = `${rect.x1}px`;
  qaZone.style.top = `${rect.y1}px`;
  qaZone.style.width = `${rect.x2 - rect.x1}px`;
  qaZone.style.height = `${rect.y2 - rect.y1}px`;
}

onValue(activeProductRefs.overlayRef, (snapshot) => {
  const overlay = snapshot.val() || {};
  const currentQuestion = overlay.currentQuestion || null;
  questionText.textContent = currentQuestion?.text || "En attente d'une question…";
  applyQaRect(overlay.quizLayout?.questionAnswerRect);
});
