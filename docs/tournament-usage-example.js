import {
  BRACKET_SIZE,
  canPlayMatch,
  createTournament,
  getRoundTitle,
  normalizeTournament,
  updateMatchWinner,
} from '../app/shared/tournament.js';

const participants = [
  { pseudo: 'Alice', character: 'Mage', image: '' },
  { pseudo: 'Bob', character: 'Knight', image: '' },
  { pseudo: 'Charly', character: 'Rogue', image: '' },
  { pseudo: 'Dina', character: 'Monk', image: '' },
  { pseudo: 'Eli', character: 'Archer', image: '' },
  { pseudo: 'Fay', character: 'Ninja', image: '' },
  { pseudo: 'Gus', character: 'Druid', image: '' },
  { pseudo: 'Hana', character: 'Paladin', image: '' },
];

let tournament = createTournament(participants, BRACKET_SIZE, { shuffle: false });

// Quarts
console.log('Quart #1 jouable ?', canPlayMatch(tournament.rounds[0][0], 0));
tournament = updateMatchWinner(tournament, 0, 0, 'left');
tournament = updateMatchWinner(tournament, 0, 1, 'right');

// Demi #1 (alimentée automatiquement)
console.log('Demi #1 jouable ?', canPlayMatch(tournament.rounds[1][0], 1));
tournament = updateMatchWinner(tournament, 1, 0, 'left');

// Termine le côté droit du bracket
for (const [roundIndex, matchIndex, side] of [
  [0, 2, 'left'],
  [0, 3, 'right'],
  [1, 0, 'left'],
  [1, 1, 'right'],
]) {
  tournament = updateMatchWinner(tournament, roundIndex, matchIndex, side);
}

// Finale
console.log('Finale jouable ?', canPlayMatch(tournament.rounds[2][0], 2));
tournament = updateMatchWinner(tournament, 2, 0, 'left');
console.log('Champion:', tournament.champion?.pseudo || 'Non défini');

// Changement rétroactif dans un quart
const beforeChange = tournament.rounds[2][0].left?.pseudo;
tournament = updateMatchWinner(tournament, 0, 0, 'right');
const afterChange = tournament.rounds[2][0].left?.pseudo;
console.log('Finale gauche avant/après changement rétroactif:', beforeChange, '=>', afterChange);

const restored = normalizeTournament(tournament);
const labels = restored.rounds.map((_, i) => getRoundTitle(i, restored.rounds.length));
console.log(labels);
