import { getProductRefsBySlug, onValue } from '../shared/firebase.js';
import { computeWinner, getOverlayMatches, getRoundTitle, normalizeTournament } from '../shared/tournament.js';
import { escapeHtml } from '../shared/view-helpers.js';

const overlayTreeContainer = document.getElementById('overlayTreeContainer');

const BASE_MATCH_CENTER = 176;

let tournamentCache = null;
let currentMatchIndex = 0;
const pageParams = new URLSearchParams(window.location.search);
const activeProductRefs = getProductRefsBySlug(pageParams.get('product'), pageParams.get('profile'));

function createMatchCard(match, roundIndex, matchIndex, flatMatches, hasNextRound) {
  const winner = computeWinner(match);
  const overlayIndex = flatMatches.findIndex(
    (entry) => entry.roundIndex === roundIndex && entry.matchIndex === matchIndex,
  );

  const shell = document.createElement('div');
  shell.className = 'tree-match-shell';

  if (hasNextRound) {
    shell.classList.add('has-next-round');
    if (matchIndex % 2 === 0) {
      shell.classList.add('pair-start');
    }
  }

  const card = document.createElement('article');
  card.className = 'tree-match-card';

  if (overlayIndex === currentMatchIndex) {
    card.classList.add('is-active');
  }

  const leftName = escapeHtml(match.left?.pseudo || 'En attente');
  const rightName = escapeHtml(match.right?.pseudo || 'En attente');

  card.innerHTML = `
    <div class="seed ${winner.side === 'left' ? 'winner' : ''}">${leftName}</div>
    <div class="seed ${winner.side === 'right' ? 'winner' : ''}">${rightName}</div>
  `;

  shell.appendChild(card);
  return shell;
}

function createRoundColumn(round, roundIndex, totalRounds, flatMatches) {
  const stepMultiplier = 2 ** roundIndex;
  const hasNextRound = roundIndex < totalRounds - 1;

  const column = document.createElement('section');
  column.className = 'bracket-round';
  column.style.setProperty('--step-multiplier', String(stepMultiplier));

  const heading = document.createElement('h3');
  heading.className = 'round-title';
  heading.textContent = getRoundTitle(roundIndex, totalRounds);
  column.appendChild(heading);

  const stack = document.createElement('div');
  stack.className = 'round-stack';

  round.forEach((match, matchIndex) => {
    stack.appendChild(createMatchCard(match, roundIndex, matchIndex, flatMatches, hasNextRound));
  });

  column.appendChild(stack);
  return column;
}

function renderTree() {
  overlayTreeContainer.innerHTML = '';

  if (!tournamentCache?.rounds?.length) {
    overlayTreeContainer.innerHTML = '<p class="empty">Aucun match.</p>';
    return;
  }

  const rounds = tournamentCache.rounds;
  const flatMatches = getOverlayMatches(tournamentCache);

  overlayTreeContainer.style.setProperty('--round-count', String(rounds.length));
  overlayTreeContainer.style.setProperty('--base-match-center', `${BASE_MATCH_CENTER}px`);

  rounds.forEach((round, roundIndex) => {
    overlayTreeContainer.appendChild(createRoundColumn(round, roundIndex, rounds.length, flatMatches));
  });

}

onValue(activeProductRefs.matchesRef, (snapshot) => {
  tournamentCache = normalizeTournament(snapshot.val());
  renderTree();
});

onValue(activeProductRefs.overlayRef, (snapshot) => {
  const value = snapshot.val() || {};
  currentMatchIndex = Number(value.matchIndex || 0);
  renderTree();
});
