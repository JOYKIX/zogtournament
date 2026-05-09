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

  const pseudo = String(participant.pseudo || '').trim();
  if (!pseudo) {
    return null;
  }

  return {
    id: String(participant.id || '').trim(),
    pseudo,
    character: String(participant.character || ''),
    image: String(participant.image || ''),
  };
}

function normalizeParticipantRef(player) {
  if (!player || typeof player !== 'object') return null;
  const id = String(player.id || '').trim();
  return id ? { id } : null;
}

function hasPlayerRef(player) {
  return Boolean(player?.id);
}

function resolvePlayer(playerRef, participantsById) {
  if (!hasPlayerRef(playerRef)) return null;
  return participantsById.get(playerRef.id) || null;
}

function hasPlayer(player) {
  return hasPlayerRef(player);
}

function isRealBye(match, roundIndex) {
  if (roundIndex !== 0) {
    return false;
  }

  const hasLeft = hasPlayer(match?.left);
  const hasRight = hasPlayer(match?.right);
  return (hasLeft && !hasRight) || (!hasLeft && hasRight);
}

function canSelectSide(match, winnerSide, roundIndex) {
  if (!isValidSide(winnerSide)) {
    return false;
  }

  const hasLeft = hasPlayer(match?.left);
  const hasRight = hasPlayer(match?.right);

  if (!hasLeft && !hasRight) {
    return false;
  }

  if (hasLeft && hasRight) {
    return winnerSide === SIDE_LEFT || winnerSide === SIDE_RIGHT;
  }

  if (!isRealBye(match, roundIndex)) {
    return false;
  }

  return (winnerSide === SIDE_LEFT && hasLeft) || (winnerSide === SIDE_RIGHT && hasRight);
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
    left: normalizeParticipantRef(match?.left),
    right: normalizeParticipantRef(match?.right),
    winnerSide: isValidSide(match?.winnerSide) ? match.winnerSide : null,
  };
}

export function canPlayMatch(match, roundIndex = 0) {
  const safeMatch = cloneMatch(match);
  const hasLeft = hasPlayer(safeMatch.left);
  const hasRight = hasPlayer(safeMatch.right);

  if (hasLeft && hasRight) {
    return true;
  }

  return isRealBye(safeMatch, roundIndex);
}

export function shuffleParticipants(participants) {
  const safeParticipants = Array.isArray(participants)
    ? participants.map(normalizeParticipant).filter(Boolean)
    : [];

  const shuffled = [...safeParticipants];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function computeWinner(match, roundIndex = 0) {
  const safeMatch = cloneMatch(match);

  if (!canPlayMatch(safeMatch, roundIndex)) {
    return { side: null, player: null };
  }

  if (isRealBye(safeMatch, roundIndex)) {
    if (safeMatch.left) {
      return { side: SIDE_LEFT, player: safeMatch.left };
    }
    return { side: SIDE_RIGHT, player: safeMatch.right };
  }

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

function seedFirstRound(firstRound, participants, bracketSize) {
  if (!Array.isArray(firstRound)) {
    return;
  }

  for (let i = 0; i < firstRound.length; i += 1) {
    const left = normalizeParticipantRef(participants[i * 2]);
    const right = normalizeParticipantRef(participants[i * 2 + 1]);
    firstRound[i] = {
      left,
      right,
      winnerSide: null,
    };
  }

  for (let i = firstRound.length * 2; i < bracketSize; i += 1) {
    // no-op, explicit for readability of first-round seeding size
  }
}

function readWinnerSelections(rawRounds, expectedRounds) {
  const sourceRounds = Array.isArray(rawRounds) ? rawRounds : [];

  return expectedRounds.map((round, roundIndex) => {
    const sourceRound = Array.isArray(sourceRounds[roundIndex]) ? sourceRounds[roundIndex] : [];
    return round.map((_, matchIndex) => {
      const side = sourceRound[matchIndex]?.winnerSide;
      return isValidSide(side) ? side : null;
    });
  });
}

function clearRound(round) {
  round.forEach((_, index) => {
    round[index] = emptyMatch();
  });
}

function computeChampionFromFinal(rounds) {
  if (!Array.isArray(rounds) || !rounds.length) {
    return null;
  }

  const finalRoundIndex = rounds.length - 1;
  const finalMatch = rounds[finalRoundIndex]?.[0];
  if (!finalMatch) {
    return null;
  }

  return computeWinner(finalMatch, finalRoundIndex).player;
}

export function rebuildTournament(rawTournament) {
  if (!rawTournament || typeof rawTournament !== 'object') {
    return null;
  }

  const bracketSize = sanitizeBracketSize(rawTournament.bracketSize, BRACKET_SIZE);
  const rounds = createEmptyRounds(bracketSize);
  const totalRounds = rounds.length;

  if (!totalRounds) {
    return null;
  }

  const participants = Array.isArray(rawTournament.participants)
    ? rawTournament.participants.map(normalizeParticipant).filter((p) => p && p.id).slice(0, bracketSize)
    : [];
  const participantsById = new Map(participants.map((p) => [p.id, p]));

  if (!participants.length && Array.isArray(rawTournament.rounds?.[0])) {
    const fromRound = rawTournament.rounds[0]
      .flatMap((match) => [normalizeParticipant(match?.left), normalizeParticipant(match?.right)])
      .filter(Boolean)
      .slice(0, bracketSize);
    fromRound.forEach((entry, index) => {
      if (!entry.id) {
        entry.id = `legacy-${index}-${entry.pseudo.toLowerCase().replace(/\s+/g, '-')}`;
      }
      participants.push(entry);
      participantsById.set(entry.id, entry);
    });
  }

  seedFirstRound(rounds[0], participants, bracketSize);

  const winnerSelections = readWinnerSelections(rawTournament.rounds, rounds);

  for (let roundIndex = 1; roundIndex < totalRounds; roundIndex += 1) {
    clearRound(rounds[roundIndex]);
  }

  for (let roundIndex = 0; roundIndex < totalRounds; roundIndex += 1) {
    const round = rounds[roundIndex];
    const nextRound = rounds[roundIndex + 1] || null;

    round.forEach((match, matchIndex) => {
      const selectedSide = winnerSelections[roundIndex][matchIndex];
      match.winnerSide = canSelectSide(match, selectedSide, roundIndex) ? selectedSide : null;

      const winner = computeWinner(match, roundIndex);
      match.winnerSide = winner.side;

      if (!nextRound || !winner.player) {
        return;
      }

      const targetMatchIndex = Math.floor(matchIndex / 2);
      const targetSide = matchIndex % 2 === 0 ? SIDE_LEFT : SIDE_RIGHT;
      const targetMatch = nextRound[targetMatchIndex];

      if (!targetMatch) {
        return;
      }

      targetMatch[targetSide] = winner.player;
    });
  }

  return {
    bracketSize,
    rounds,
    participants,
    generatedAt: Number(rawTournament.generatedAt) || Date.now(),
    champion: resolvePlayer(computeChampionFromFinal(rounds), participantsById),
    participantsById: Object.fromEntries(participantsById),
  };
}

export function createTournament(participants, bracketSize = BRACKET_SIZE, options = {}) {
  const safeBracketSize = sanitizeBracketSize(bracketSize, BRACKET_SIZE);
  const safeParticipants = Array.isArray(participants)
    ? participants.map(normalizeParticipant).filter((p) => p && p.id).slice(0, safeBracketSize)
    : [];

  const seeded = options.shuffle === false ? safeParticipants : shuffleParticipants(safeParticipants);

  return rebuildTournament({
    bracketSize: safeBracketSize,
    participants: seeded,
    rounds: createEmptyRounds(safeBracketSize),
    generatedAt: Date.now(),
  });
}

export function updateMatchWinner(tournament, roundIndex, matchIndex, winnerSide) {
  if (!tournament || !Array.isArray(tournament.rounds)) {
    return null;
  }

  const safeTournament = {
    ...tournament,
    rounds: tournament.rounds.map((round) => (Array.isArray(round) ? round.map(cloneMatch) : [])),
  };

  const targetMatch = safeTournament.rounds?.[roundIndex]?.[matchIndex];
  if (!targetMatch) {
    return rebuildTournament(safeTournament);
  }

  if (!isValidSide(winnerSide) || !canPlayMatch(targetMatch, roundIndex) || !targetMatch[winnerSide]) {
    targetMatch.winnerSide = null;
  } else {
    targetMatch.winnerSide = winnerSide;
  }

  for (let nextRoundIndex = roundIndex + 1; nextRoundIndex < safeTournament.rounds.length; nextRoundIndex += 1) {
    const round = safeTournament.rounds[nextRoundIndex] || [];
    round.forEach((match) => {
      match.winnerSide = null;
    });
  }

  return rebuildTournament(safeTournament);
}

export function normalizeTournament(snapshotValue) {
  if (!snapshotValue) {
    return null;
  }

  if (Array.isArray(snapshotValue)) {
    const legacyParticipants = snapshotValue
      .flatMap((match) => [normalizeParticipant(match?.left), normalizeParticipant(match?.right)])
      .filter(Boolean);

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

  const participantsById = new Map(
    (Array.isArray(tournament.participants) ? tournament.participants : [])
      .map((p) => normalizeParticipant(p))
      .filter((p) => p && p.id)
      .map((p) => [p.id, p]),
  );

  return tournament.rounds.flatMap((round, roundIndex) =>
    round
      .map((match, matchIndex) => {
        const cloned = cloneMatch(match);
        return {
          roundIndex,
          matchIndex,
          ...cloned,
          left: resolvePlayer(cloned.left, participantsById),
          right: resolvePlayer(cloned.right, participantsById),
        };
      })
      .filter((match) => canPlayMatch(match, roundIndex)),
  );
}
