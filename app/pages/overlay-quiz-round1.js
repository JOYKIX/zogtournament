import { getProductRefsBySlug, onValue, ref } from '../shared/firebase.js';
import { escapeHtml } from '../shared/view-helpers.js';

const params = new URLSearchParams(window.location.search);
const profileId = String(params.get('profile') || '').trim() || null;
const product = String(params.get('product') || 'quiz').trim().toLowerCase();
const activeProductRefs = getProductRefsBySlug(product, profileId);

const streamerLeaderboard = document.getElementById('streamerLeaderboard');
const viewerLeaderboard = document.getElementById('viewerLeaderboard');
const questionType = document.getElementById('questionType');
const questionText = document.getElementById('questionText');
const buzzStatus = document.getElementById('buzzStatus');

const roundRef = ref(activeProductRefs.productRootRef, 'round1');

function renderList(container, rows) {
  if (!rows.length) {
    container.innerHTML = '<li>En attente…</li>';
    return;
  }
  container.innerHTML = rows
    .sort((a, b) => Number(b.points || 0) - Number(a.points || 0))
    .map((entry) => `<li>${escapeHtml(entry.name || 'Sans nom')} — ${Number(entry.points || 0)} pts</li>`)
    .join('');
}

onValue(ref(roundRef, 'scores/streamers'), (snapshot) => {
  const value = snapshot.val() || {};
  renderList(streamerLeaderboard, Object.values(value));
});

onValue(ref(roundRef, 'scores/viewers'), (snapshot) => {
  const value = snapshot.val() || {};
  renderList(viewerLeaderboard, Object.values(value));
});

onValue(activeProductRefs.overlayRef, (snapshot) => {
  const overlay = snapshot.val() || {};
  const currentQuestion = overlay.currentQuestion || null;
  questionType.textContent = currentQuestion?.type === 'viewers' ? 'Question viewers' : 'Question streamer';
  questionText.textContent = currentQuestion?.text || "En attente d'une question…";
});

onValue(ref(roundRef, 'buzzer/currentBuzz'), (snapshot) => {
  const buzz = snapshot.val() || null;
  buzzStatus.textContent = buzz ? `🎯 ${buzz.pseudo || 'Participant'} a la main` : 'Aucun buzz.';
});
