import { matchesRef, onValue, overlayRef } from './firebase.js';

const duelView = document.getElementById('duelView');
const treeView = document.getElementById('treeView');
const overlayTreeContainer = document.getElementById('overlayTreeContainer');
const leftFighter = document.getElementById('leftFighter');
const rightFighter = document.getElementById('rightFighter');

let tournamentCache = null;
let currentMatchIndex = 0;
let currentMode = 'duel';

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

function cloneMatch(match) {
  return {
    left: match?.left || null,
    right: match?.right || null,
    winnerSide: match?.winnerSide === 'left' || match?.winnerSide === 'right' ? match.winnerSide : null,
  };
}

function computeWinner(match) {
  if (match.left && !match.right) {
    return { side: 'left', player: match.left };
  }

  if (!match.left && match.right) {
    return { side: 'right', player: match.right };
  }

  if (match.winnerSide === 'left' && match.left) {
    return { side: 'left', player: match.left };
  }

  if (match.winnerSide === 'right' && match.right) {
    return { side: 'right', player: match.right };
  }

  return { side: null, player: null };
}

function rebuildTournament(rawTournament) {
  if (!rawTournament || !Array.isArray(rawTournament.rounds) || !rawTournament.rounds.length) {
    return null;
  }

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

      if (!winner.player) {
        return;
      }

      const nextMatch = nextRound[Math.floor(matchIndex / 2)];
      if (!nextMatch) {
        return;
      }

      if (matchIndex % 2 === 0) {
        nextMatch.left = winner.player;
      } else {
        nextMatch.right = winner.player;
      }
    });
  }

  return { rounds };
}

function normalizeTournament(snapshotValue) {
  if (!snapshotValue) {
    return null;
  }

  if (Array.isArray(snapshotValue)) {
    const legacyRound = snapshotValue
      .filter((match) => match?.left?.pseudo && match?.right?.pseudo)
      .map((match) => ({ left: match.left, right: match.right, winnerSide: null }));

    if (!legacyRound.length) {
      return null;
    }

    return rebuildTournament({ rounds: [legacyRound] });
  }

  return rebuildTournament(snapshotValue);
}

function getOverlayMatches() {
  if (!tournamentCache?.rounds) {
    return [];
  }

  const matches = [];
  tournamentCache.rounds.forEach((round, roundIndex) => {
    round.forEach((match, matchIndex) => {
      if (!match.left && !match.right) {
        return;
      }

      matches.push({ roundIndex, matchIndex, ...match });
    });
  });

  return matches;
}

function getRoundTitle(roundIndex, totalRounds) {
  const roundsUntilFinal = totalRounds - roundIndex;
  if (roundsUntilFinal === 1) return 'Finale';
  if (roundsUntilFinal === 2) return 'Demi';
  if (roundsUntilFinal === 3) return 'Quarts';
  if (roundsUntilFinal === 4) return '8e';
  return `Tour ${roundIndex + 1}`;
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

function renderTree() {
  overlayTreeContainer.innerHTML = '';

  if (!tournamentCache?.rounds?.length) {
    overlayTreeContainer.innerHTML = '<p>Aucun match.</p>';
    return;
  }

  const overlayMatches = getOverlayMatches();

  tournamentCache.rounds.forEach((round, roundIndex) => {
    const col = document.createElement('section');
    col.className = 'round';
    col.innerHTML = `<h3>${getRoundTitle(roundIndex, tournamentCache.rounds.length)}</h3>`;

    round.forEach((match, matchIndex) => {
      const card = document.createElement('article');
      card.className = 'overlay-match';

      const winner = computeWinner(match);
      const left = escapeHtml(match.left?.pseudo || 'TBD');
      const right = escapeHtml(match.right?.pseudo || 'TBD');
      card.innerHTML = `
        <div class="row ${winner.side === 'left' ? 'winner' : ''}">${left}</div>
        <div class="vs">VS</div>
        <div class="row ${winner.side === 'right' ? 'winner' : ''}">${right}</div>
      `;

      const flatIndex = overlayMatches.findIndex(
        (entry) => entry.roundIndex === roundIndex && entry.matchIndex === matchIndex,
      );

      if (flatIndex === currentMatchIndex) {
        card.classList.add('active');
      }

      col.appendChild(card);
    });

    overlayTreeContainer.appendChild(col);
  });
}

function render() {
  const overlayMatches = getOverlayMatches();
  const safeIndex = Math.max(0, Math.min(currentMatchIndex, Math.max(overlayMatches.length - 1, 0)));
  const match = overlayMatches[safeIndex];

  leftFighter.innerHTML = fighterMarkup(match?.left);
  rightFighter.innerHTML = fighterMarkup(match?.right);

  const treeMode = currentMode === 'tree';
  duelView.classList.toggle('hidden', treeMode);
  treeView.classList.toggle('hidden', !treeMode);

  renderTree();
}

onValue(matchesRef, (snapshot) => {
  tournamentCache = normalizeTournament(snapshot.val());
  render();
});

onValue(overlayRef, (snapshot) => {
  const value = snapshot.val() || {};
  currentMatchIndex = Number(value.matchIndex || 0);
  currentMode = value.mode === 'tree' ? 'tree' : 'duel';
  render();
});
