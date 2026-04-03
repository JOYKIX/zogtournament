import { matchesRef, onValue, overlayRef } from '../shared/firebase.js';
import { computeWinner, getOverlayMatches, getRoundTitle, normalizeTournament } from '../shared/tournament.js';
import { escapeHtml } from '../shared/view-helpers.js';

const overlayTreeContainer = document.getElementById('overlayTreeContainer');

let tournamentCache = null;
let currentMatchIndex = 0;

function renderTree() {
  overlayTreeContainer.innerHTML = '';

  if (!tournamentCache?.rounds?.length) {
    overlayTreeContainer.innerHTML = '<p class="empty">Aucun match.</p>';
    return;
  }

  const flatMatches = getOverlayMatches(tournamentCache);

  tournamentCache.rounds.forEach((round, roundIndex) => {
    const roundCol = document.createElement('section');
    roundCol.className = 'round-col';
    roundCol.style.setProperty('--round-index', String(roundIndex));

    const heading = document.createElement('h3');
    heading.textContent = getRoundTitle(roundIndex, tournamentCache.rounds.length);
    roundCol.appendChild(heading);

    round.forEach((match, matchIndex) => {
      const winner = computeWinner(match);

      const card = document.createElement('article');
      card.className = 'tree-match';

      const overlayIndex = flatMatches.findIndex(
        (entry) => entry.roundIndex === roundIndex && entry.matchIndex === matchIndex,
      );

      if (overlayIndex === currentMatchIndex) {
        card.classList.add('active');
      }

      const leftName = escapeHtml(match.left?.pseudo || 'En attente');
      const rightName = escapeHtml(match.right?.pseudo || 'En attente');

      card.innerHTML = `
        <div class="seed ${winner.side === 'left' ? 'winner' : ''}">${leftName}</div>
        <div class="seed ${winner.side === 'right' ? 'winner' : ''}">${rightName}</div>
      `;

      roundCol.appendChild(card);
    });

    overlayTreeContainer.appendChild(roundCol);
  });
}

onValue(matchesRef, (snapshot) => {
  tournamentCache = normalizeTournament(snapshot.val());
  renderTree();
});

onValue(overlayRef, (snapshot) => {
  const value = snapshot.val() || {};
  currentMatchIndex = Number(value.matchIndex || 0);
  renderTree();
});
