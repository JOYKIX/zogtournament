import { matchesRef, onValue, overlayRef } from '../shared/firebase.js';
import { getOverlayMatches, normalizeTournament } from '../shared/tournament.js';
import { escapeHtml, normalizeImageUrl } from '../shared/view-helpers.js';

const leftFighter = document.getElementById('leftFighter');
const rightFighter = document.getElementById('rightFighter');
const duelView = document.querySelector('.duel-view');

const DEFAULT_DUEL_IMAGE_HEIGHT_PX = 760;
const MIN_DUEL_IMAGE_HEIGHT_PX = 200;
const MAX_DUEL_IMAGE_HEIGHT_PX = 1400;

let tournamentCache = null;
let currentMatchIndex = 0;
let currentImageHeightPx = DEFAULT_DUEL_IMAGE_HEIGHT_PX;

function sanitizeDuelImageHeight(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_DUEL_IMAGE_HEIGHT_PX;
  }

  return Math.max(MIN_DUEL_IMAGE_HEIGHT_PX, Math.min(MAX_DUEL_IMAGE_HEIGHT_PX, Math.round(parsed)));
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

function render() {
  const overlayMatches = getOverlayMatches(tournamentCache);
  const safeIndex = Math.max(0, Math.min(currentMatchIndex, Math.max(overlayMatches.length - 1, 0)));
  const match = overlayMatches[safeIndex];

  leftFighter.innerHTML = fighterMarkup(match?.left);
  rightFighter.innerHTML = fighterMarkup(match?.right);

  if (duelView) {
    duelView.style.setProperty('--fighter-image-height', `${currentImageHeightPx}px`);
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
  render();
});
