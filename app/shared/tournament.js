export const BRACKET_SIZE = 8;

export function getRoundTitle(roundIndex, totalRounds) {
  const labels = ['Quarts de finale', 'Demi-finales', 'Finale'];
  if (totalRounds === 3) {
    return labels[roundIndex] || `Tour ${roundIndex + 1}`;
  }

  const roundsUntilFinal = totalRounds - roundIndex;
  if (roundsUntilFinal === 1) return 'Finale';
  if (roundsUntilFinal === 2) return 'Demi-finales';
  return `Tour ${roundIndex + 1}`;
}

export function emptyMatch() {
  return {
    left: null,
    right: null,
    winnerSide: null,
  };
}

export function cloneMatch(match) {
  return {
    left: match?.left || null,
    right: match?.right || null,
    winnerSide: match?.winnerSide === 'left' || match?.winnerSide === 'right' ? match.winnerSide : null,
  };
}

export function sanitizeBracketSize(value, fallback = BRACKET_SIZE) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return fallback;
  }

  const rounded = Math.trunc(normalized);
  const isPowerOfTwo = rounded > 0 && (rounded & (rounded - 1)) === 0;

  if (rounded < 2 || !isPowerOfTwo) {
    return fallback;
  }

  return rounded;
}

function expectedRoundCountFromFirstRound(firstRound) {
  if (!Array.isArray(firstRound) || firstRound.length < 1) {
    return 0;
  }

  const participantSlots = firstRound.length * 2;
  const rounds = Math.log2(participantSlots);
  if (!Number.isInteger(rounds) || rounds < 1) {
    return 0;
  }

  return rounds;
}

function ensureRoundShape(rounds) {
  if (!Array.isArray(rounds) || !rounds.length) {
    return [];
  }

  const expectedRounds = expectedRoundCountFromFirstRound(rounds[0]);
  if (!expectedRounds) {
    return rounds;
  }

  for (let roundIndex = 0; roundIndex < expectedRounds; roundIndex += 1) {
    const expectedMatches = rounds[0].length / 2 ** roundIndex;
    const existing = Array.isArray(rounds[roundIndex]) ? rounds[roundIndex] : [];

    rounds[roundIndex] = Array.from({ length: expectedMatches }, (_, matchIndex) =>
      cloneMatch(existing[matchIndex] || emptyMatch()),
    );
  }

  rounds.length = expectedRounds;
  return rounds;
}

export function shuffleParticipants(participants) {
  const shuffled = [...participants];

  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

export function computeWinner(match) {
  const left = match.left;
  const right = match.right;

  if (!left && !right) {
    return { side: null, player: null };
  }

  if (left && !right) {
    return { side: 'left', player: left };
  }

  if (!left && right) {
    return { side: 'right', player: right };
  }

  if (match.winnerSide === 'left') {
    return { side: 'left', player: left };
  }

  if (match.winnerSide === 'right') {
    return { side: 'right', player: right };
  }

  return { side: null, player: null };
}

export function rebuildTournament(rawTournament) {
  if (!rawTournament || !Array.isArray(rawTournament.rounds) || !rawTournament.rounds.length) {
    return null;
  }

  const rounds = ensureRoundShape(rawTournament.rounds.map((round) => (Array.isArray(round) ? round.map(cloneMatch) : [])));

  if (!rounds.length) {
    return null;
  }

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

      const targetMatch = nextRound[Math.floor(matchIndex / 2)];
      if (!targetMatch) {
        return;
      }

      if (matchIndex % 2 === 0) {
        targetMatch.left = winner.player;
      } else {
        targetMatch.right = winner.player;
      }
    });
  }

  const championMatch = rounds[rounds.length - 1][0] || emptyMatch();
  const champion = computeWinner(championMatch).player;

  const storedBracketSize = sanitizeBracketSize(rawTournament.bracketSize, rounds[0]?.length * 2 || BRACKET_SIZE);

  return {
    rounds,
    generatedAt: rawTournament.generatedAt || Date.now(),
    champion,
    bracketSize: storedBracketSize,
  };
}

export function normalizeTournament(snapshotValue) {
  if (!snapshotValue) {
    return null;
  }

  if (Array.isArray(snapshotValue)) {
    const legacyRound = snapshotValue
      .filter((match) => match?.left?.pseudo && match?.right?.pseudo)
      .map((match) => ({
        left: match.left,
        right: match.right,
        winnerSide: null,
      }));

    if (!legacyRound.length) {
      return null;
    }

    const tournament = {
      rounds: [legacyRound, [emptyMatch(), emptyMatch()], [emptyMatch()]],
      generatedAt: Date.now(),
      bracketSize: BRACKET_SIZE,
    };

    return rebuildTournament(tournament);
  }

  return rebuildTournament(snapshotValue);
}

export function createTournament(participants, bracketSize = BRACKET_SIZE) {
  const sanitized = shuffleParticipants(
    participants.map(({ id, ...participant }) => ({
      pseudo: participant.pseudo,
      character: participant.character,
      image: participant.image || '',
    })),
  );

  const safeBracketSize = sanitizeBracketSize(bracketSize);
  const roundsCount = Math.log2(safeBracketSize);

  const rounds = Array.from({ length: roundsCount }, (_, roundIndex) => {
    const matchesInRound = safeBracketSize / 2 ** (roundIndex + 1);
    return Array.from({ length: matchesInRound }, () => emptyMatch());
  });

  const firstRound = rounds[0];
  for (let i = 0; i < safeBracketSize; i += 2) {
    const matchIndex = i / 2;
    firstRound[matchIndex].left = sanitized[i] || null;
    firstRound[matchIndex].right = sanitized[i + 1] || null;
  }

  return rebuildTournament({
    rounds,
    generatedAt: Date.now(),
    bracketSize: safeBracketSize,
  });
}

export function getOverlayMatches(tournament) {
  if (!tournament || !Array.isArray(tournament.rounds)) {
    return [];
  }

  const items = [];
  tournament.rounds.forEach((round, roundIndex) => {
    round.forEach((match, matchIndex) => {
      if (!match.left && !match.right) {
        return;
      }

      items.push({
        roundIndex,
        matchIndex,
        ...match,
      });
    });
  });

  return items;
}
