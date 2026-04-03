export const BRACKET_SIZE = 8;
const MIN_BRACKET_SIZE = 2;
const SIDE_LEFT = 'left';
const SIDE_RIGHT = 'right';

function isValidSide(side) {
  return side === SIDE_LEFT || side === SIDE_RIGHT;
}

function isPowerOfTwo(value) {
  return Number.isInteger(value) && value >= MIN_BRACKET_SIZE && (value & (value - 1)) === 0;
}

function normalizeParticipant(participant) {
  if (!participant || typeof participant !== 'object') {
    return null;
  }

  return {
    pseudo: participant.pseudo || '',
    character: participant.character || '',
    image: participant.image || '',
  };
}

export function sanitizeBracketSize(value, fallback = BRACKET_SIZE) {
  const fallbackSafe = isPowerOfTwo(Math.trunc(Number(fallback))) ? Math.trunc(Number(fallback)) : BRACKET_SIZE;
  const numeric = Math.trunc(Number(value));
  return isPowerOfTwo(numeric) ? numeric : fallbackSafe;
}

export function getRoundTitle(roundIndex, totalRounds) {
  if (!Number.isInteger(roundIndex) || !Number.isInteger(totalRounds) || roundIndex < 0 || roundIndex >= totalRounds) {
    return `Tour ${Number(roundIndex) + 1 || 1}`;
  }

  const roundsUntilFinal = totalRounds - roundIndex;

  if (roundsUntilFinal === 1) return 'Finale';
  if (roundsUntilFinal === 2) return 'Demi-finales';
  if (roundsUntilFinal === 3) return 'Quarts de finale';
  if (roundsUntilFinal === 4) return 'Huitièmes de finale';
  if (roundsUntilFinal === 5) return 'Seizièmes de finale';

  return `Tour ${roundIndex + 1}`;
}

export function emptyMatch() {
  return { left: null, right: null, winnerSide: null };
}

export function cloneMatch(match) {
  return {
    left: normalizeParticipant(match?.left),
    right: normalizeParticipant(match?.right),
    winnerSide: isValidSide(match?.winnerSide) ? match.winnerSide : null,
  };
}

export function shuffleParticipants(participants) {
  const safeParticipants = Array.isArray(participants)
    ? participants
        .map(normalizeParticipant)
        .filter((participant) => participant && participant.pseudo)
    : [];

  const shuffled = [...safeParticipants];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function computeWinner(match) {
  const safeMatch = cloneMatch(match);

  if (safeMatch.left && !safeMatch.right) return { side: SIDE_LEFT, player: safeMatch.left };
  if (!safeMatch.left && safeMatch.right) return { side: SIDE_RIGHT, player: safeMatch.right };

  if (safeMatch.winnerSide === SIDE_LEFT && safeMatch.left) {
    return { side: SIDE_LEFT, player: safeMatch.left };
  }

  if (safeMatch.winnerSide === SIDE_RIGHT && safeMatch.right) {
    return { side: SIDE_RIGHT, player: safeMatch.right };
  }

  return { side: null, player: null };
}

function computeRoundCount(bracketSize) {
  return Math.log2(sanitizeBracketSize(bracketSize));
}

function createEmptyRounds(bracketSize) {
  const safeBracketSize = sanitizeBracketSize(bracketSize);
  const totalRounds = computeRoundCount(safeBracketSize);

  return Array.from({ length: totalRounds }, (_, roundIndex) => {
    const matchesCount = safeBracketSize / 2 ** (roundIndex + 1);
    return Array.from({ length: matchesCount }, () => emptyMatch());
  });
}

function buildRoundFromSnapshot(roundValue, expectedMatchCount) {
  const round = Array.isArray(roundValue) ? roundValue : [];
  return Array.from({ length: expectedMatchCount }, (_, matchIndex) => cloneMatch(round[matchIndex]));
}

function sanitizeRounds(rawRounds, bracketSize) {
  const skeleton = createEmptyRounds(bracketSize);
  const sourceRounds = Array.isArray(rawRounds) ? rawRounds : [];

  return skeleton.map((skeletonRound, roundIndex) =>
    buildRoundFromSnapshot(sourceRounds[roundIndex], skeletonRound.length),
  );
}

function seedFirstRound(rounds, participants) {
  const firstRound = rounds[0];
  if (!firstRound) {
    return;
  }

  for (let i = 0; i < firstRound.length; i += 1) {
    const left = participants[i * 2] || null;
    const right = participants[i * 2 + 1] || null;

    firstRound[i].left = left;
    firstRound[i].right = right;
    firstRound[i].winnerSide = isValidSide(firstRound[i].winnerSide) ? firstRound[i].winnerSide : null;
  }
}

function propagateWinners(rounds) {
  for (let roundIndex = 0; roundIndex < rounds.length - 1; roundIndex += 1) {
    const currentRound = rounds[roundIndex];
    const nextRound = rounds[roundIndex + 1];

    nextRound.forEach((match) => {
      match.left = null;
      match.right = null;
      match.winnerSide = null;
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
}

function computeChampionFromFinal(rounds) {
  if (!Array.isArray(rounds) || !rounds.length) {
    return null;
  }

  const finalMatch = rounds[rounds.length - 1]?.[0] || emptyMatch();
  return computeWinner(finalMatch).player;
}

export function rebuildTournament(rawTournament) {
  if (!rawTournament || typeof rawTournament !== 'object') {
    return null;
  }

  const bracketSize = sanitizeBracketSize(rawTournament.bracketSize, BRACKET_SIZE);
  const rounds = sanitizeRounds(rawTournament.rounds, bracketSize);

  if (!rounds.length) {
    return null;
  }

  const seededParticipants = Array.isArray(rawTournament.participants)
    ? rawTournament.participants.map(normalizeParticipant).filter(Boolean)
    : rounds[0].flatMap((match) => [match.left, match.right]).filter(Boolean);

  seedFirstRound(rounds, seededParticipants.slice(0, bracketSize));
  propagateWinners(rounds);

  return {
    bracketSize,
    rounds,
    generatedAt: Number(rawTournament.generatedAt) || Date.now(),
    champion: computeChampionFromFinal(rounds),
  };
}

export function createTournament(participants, bracketSize = BRACKET_SIZE, options = {}) {
  const safeBracketSize = sanitizeBracketSize(bracketSize, BRACKET_SIZE);
  const rounds = createEmptyRounds(safeBracketSize);

  const safeParticipants = Array.isArray(participants)
    ? participants
        .map(normalizeParticipant)
        .filter((participant) => participant && participant.pseudo)
        .slice(0, safeBracketSize)
    : [];

  const seeded = options.shuffle === false ? safeParticipants : shuffleParticipants(safeParticipants);

  return rebuildTournament({
    bracketSize: safeBracketSize,
    rounds,
    participants: seeded,
    generatedAt: Date.now(),
  });
}

export function updateMatchWinner(tournament, roundIndex, matchIndex, winnerSide) {
  if (!tournament || !Array.isArray(tournament.rounds)) {
    return null;
  }

  if (!isValidSide(winnerSide)) {
    return rebuildTournament(tournament);
  }

  const safeTournament = {
    ...tournament,
    rounds: tournament.rounds.map((round) => (Array.isArray(round) ? round.map(cloneMatch) : [])),
  };

  const targetMatch = safeTournament.rounds?.[roundIndex]?.[matchIndex];
  if (!targetMatch) {
    return rebuildTournament(safeTournament);
  }

  if (!targetMatch[winnerSide]) {
    return rebuildTournament(safeTournament);
  }

  targetMatch.winnerSide = winnerSide;
  return rebuildTournament(safeTournament);
}

export function normalizeTournament(snapshotValue) {
  if (!snapshotValue) {
    return null;
  }

  // Legacy format: array of first-round matches.
  if (Array.isArray(snapshotValue)) {
    const legacyParticipants = snapshotValue
      .flatMap((match) => [normalizeParticipant(match?.left), normalizeParticipant(match?.right)])
      .filter((participant) => participant && participant.pseudo);

    if (!legacyParticipants.length) {
      return null;
    }

    const nextPowerOfTwo = 2 ** Math.max(1, Math.ceil(Math.log2(Math.max(2, legacyParticipants.length))));
    return createTournament(legacyParticipants, sanitizeBracketSize(nextPowerOfTwo), { shuffle: false });
  }

  return rebuildTournament(snapshotValue);
}

export function getOverlayMatches(tournament) {
  if (!tournament || !Array.isArray(tournament.rounds)) {
    return [];
  }

  return tournament.rounds.flatMap((round, roundIndex) =>
    round
      .map((match, matchIndex) => ({ roundIndex, matchIndex, ...cloneMatch(match) }))
      .filter((match) => match.left || match.right),
  );
}
