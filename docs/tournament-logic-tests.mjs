import assert from 'node:assert/strict';
import { canPlayMatch, createTournament, updateMatchWinner } from '../app/shared/tournament.js';

const players = [
  'P1',
  'P2',
  'P3',
  'P4',
  'P5',
  'P6',
  'P7',
  'P8',
].map((pseudo) => ({ pseudo, character: 'Main' }));

let t = createTournament(players, 8, { shuffle: false });

assert.equal(t.rounds[0].length, 4);
assert.equal(t.rounds[1].length, 2);
assert.equal(t.rounds[2].length, 1);

// Quarts -> demis
assert.equal(canPlayMatch(t.rounds[1][0], 1), false);
t = updateMatchWinner(t, 0, 0, 'left');
assert.equal(t.rounds[1][0].left?.pseudo, 'P1');
assert.equal(canPlayMatch(t.rounds[1][0], 1), false);
t = updateMatchWinner(t, 0, 1, 'right');
assert.equal(t.rounds[1][0].right?.pseudo, 'P4');
assert.equal(canPlayMatch(t.rounds[1][0], 1), true);

// Demis -> finale
assert.equal(canPlayMatch(t.rounds[2][0], 2), false);
t = updateMatchWinner(t, 1, 0, 'left');
assert.equal(t.rounds[2][0].left?.pseudo, 'P1');
assert.equal(canPlayMatch(t.rounds[2][0], 2), false);

t = updateMatchWinner(t, 0, 2, 'left');
t = updateMatchWinner(t, 0, 3, 'left');
t = updateMatchWinner(t, 1, 0, 'left');
t = updateMatchWinner(t, 1, 1, 'right');
assert.equal(t.rounds[2][0].left?.pseudo, 'P1');
assert.equal(t.rounds[2][0].right?.pseudo, 'P7');
assert.equal(canPlayMatch(t.rounds[2][0], 2), true);

// Finale -> champion
assert.equal(t.champion, null);
t = updateMatchWinner(t, 2, 0, 'right');
assert.equal(t.champion?.pseudo, 'P7');

// Changement rétroactif -> reset rounds suivants
const previousFinalLeft = t.rounds[2][0].left?.pseudo;
t = updateMatchWinner(t, 0, 0, 'right');
assert.equal(t.rounds[1][0].left?.pseudo, 'P2');
assert.equal(t.rounds[1][0].winnerSide, null);
assert.equal(t.rounds[2][0].left, null);
assert.equal(t.rounds[2][0].winnerSide, null);
assert.equal(t.champion, null);
assert.notEqual(previousFinalLeft, t.rounds[2][0].left?.pseudo ?? null);

console.log('All tournament logic tests passed.');
