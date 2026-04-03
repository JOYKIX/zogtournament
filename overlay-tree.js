import { matchesRef, onValue, overlayRef } from './firebase.js';

const overlayTreeContainer = document.getElementById('overlayTreeContainer');

let tournamentCache = null;
let currentMatchIndex = 0;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function cloneMatch(match) {
  return {
    left: match?.left || null,
    right: match?.right || null,
    winnerSide: match?.winnerSide === 'left' || match?.winnerSide === 'right' ? match.winnerSide : null,
  };
}

function computeWinner(match) {
  if (match.left && !match.right) return { side: 'left', player: match.left };
  if (!match.left && match.right) return { side: 'right', player: match.right };
  if (match.winnerSide === 'left' && match.left) return { side: 'left', player: match.left };
  if (match.winnerSide === 'right' && match.right) return { side: 'right', player: match.right };
  return { side: null, player: null };
}

function rebuildTournament(rawTournament) {
  if (!rawTournament || !Array.isArray(rawTournament.rounds) || !rawTournament.rounds.length) return null;

  const rounds = rawTournament.rounds.map((round) => (Array.isArray(round) ? round.map(cloneMatch) : []));

  for (let roundIndex = 0; roundIndex < rounds.length - 1; roundIndex += 1) {
    const currentRound = rounds[roundIndex];
    const nextRound = rounds[roundIndex + 1];

    nextRound.forEach((match) => {
      match.left = null;
      match.right = null;
    });

    currentRound.forEach((match, matchIndex) => {
      const winner = computeWinner(match);
      match.winnerSide = winner.side;
      if (!winner.player) return;

      const nextMatch = nextRound[Math.floor(matchIndex / 2)];
      if (!nextMatch) return;

      if (matchIndex % 2 === 0) nextMatch.left = winner.player;
      else nextMatch.right = winner.player;
    });
  }

  return { rounds };
}

function normalizeTournament(snapshotValue) {
  if (!snapshotValue) return null;

  if (Array.isArray(snapshotValue)) {
    const legacyRound = snapshotValue
      .filter((match) => match?.left?.pseudo && match?.right?.pseudo)
      .map((match) => ({ left: match.left, right: match.right, winnerSide: null }));

    if (!legacyRound.length) return null;
    return rebuildTournament({ rounds: [legacyRound] });
  }

  return rebuildTournament(snapshotValue);
}

function getRoundTitle(roundIndex, totalRounds) {
  const roundsUntilFinal = totalRounds - roundIndex;
  if (roundsUntilFinal === 1) return 'Finale';
  if (roundsUntilFinal === 2) return 'Demi-finales';
  if (roundsUntilFinal === 3) return 'Quarts de finale';
  if (roundsUntilFinal === 4) return 'Huitièmes';
  return `Tour ${roundIndex + 1}`;
}

function getOverlayMatches() {
  if (!tournamentCache?.rounds) return [];
  const matches = [];

  tournamentCache.rounds.forEach((round, roundIndex) => {
    round.forEach((match, matchIndex) => {
      if (!match.left && !match.right) return;
      matches.push({ roundIndex, matchIndex });
    });
  });

  return matches;
}

function renderTree() {
  overlayTreeContainer.innerHTML = '';

  if (!tournamentCache?.rounds?.length) {
    overlayTreeContainer.innerHTML = '<p class="empty">Aucun match.</p>';
    return;
  }

  const flatMatches = getOverlayMatches();

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
