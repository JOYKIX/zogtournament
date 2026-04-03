import { matchesRef, onValue, overlayRef } from './firebase.js';

const leftFighter = document.getElementById('leftFighter');
const rightFighter = document.getElementById('rightFighter');

let matchesCache = [];
let currentMatchIndex = 0;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeImageUrl(url) {
  const raw = String(url || '').trim();
  if (!raw || !/^https?:\/\//i.test(raw)) {
    return 'https://placehold.co/600x800?text=No+Image';
  }

  return raw;
}

function fighterMarkup(player) {
  if (!player) {
    return '<div class="name">En attente</div>';
  }

  const safePseudo = escapeHtml(player.pseudo || 'Inconnu');
  const safeCharacter = escapeHtml(player.character || 'Personnage inconnu');

  return `
    <img src="${normalizeImageUrl(player.image)}" alt="${safePseudo}" />
    <div class="name">${safePseudo}</div>
    <div class="character">${safeCharacter}</div>
  `;
}

function render() {
  const match = matchesCache[currentMatchIndex];

  leftFighter.innerHTML = fighterMarkup(match?.left);
  rightFighter.innerHTML = fighterMarkup(match?.right);
}

onValue(matchesRef, (snapshot) => {
  matchesCache = snapshot.val() || [];
  render();
});

onValue(overlayRef, (snapshot) => {
  currentMatchIndex = Number(snapshot.val()?.matchIndex || 0);
  render();
});
