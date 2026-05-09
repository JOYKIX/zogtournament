import assert from 'node:assert/strict';
import { canPlayMatch, createTournament, updateMatchWinner } from '../app/shared/tournament.js';

const players = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'].map((pseudo, index) => ({
  id: `p${index + 1}`,
  pseudo,
  character: 'Main',
}));

let t = createTournament(players, 8, { shuffle: false });

assert.equal(t.rounds[0].length, 4);
assert.equal(t.rounds[1].length, 2);
assert.equal(t.rounds[2].length, 1);

assert.equal(canPlayMatch(t.rounds[1][0], 1), false);
t = updateMatchWinner(t, 0, 0, 'left');
assert.equal(t.rounds[1][0].left?.id, 'p1');
assert.equal(canPlayMatch(t.rounds[1][0], 1), false);
t = updateMatchWinner(t, 0, 1, 'right');
assert.equal(t.rounds[1][0].right?.id, 'p4');
assert.equal(canPlayMatch(t.rounds[1][0], 1), true);

assert.equal(canPlayMatch(t.rounds[2][0], 2), false);
t = updateMatchWinner(t, 1, 0, 'left');
assert.equal(t.rounds[2][0].left?.id, 'p1');
assert.equal(canPlayMatch(t.rounds[2][0], 2), false);

t = updateMatchWinner(t, 0, 2, 'left');
t = updateMatchWinner(t, 0, 3, 'left');
t = updateMatchWinner(t, 1, 0, 'left');
t = updateMatchWinner(t, 1, 1, 'right');
assert.equal(t.rounds[2][0].left?.id, 'p1');
assert.equal(t.rounds[2][0].right?.id, 'p7');
assert.equal(canPlayMatch(t.rounds[2][0], 2), true);

assert.equal(t.champion, null);
t = updateMatchWinner(t, 2, 0, 'right');
assert.equal(t.champion?.pseudo, 'P7');

const previousFinalLeft = t.rounds[2][0].left?.id;
t = updateMatchWinner(t, 0, 0, 'right');
assert.equal(t.rounds[1][0].left?.id, 'p2');
assert.equal(t.rounds[1][0].winnerSide, null);
assert.equal(t.rounds[2][0].left, null);
assert.equal(t.rounds[2][0].winnerSide, null);
assert.equal(t.champion, null);
assert.notEqual(previousFinalLeft, t.rounds[2][0].left?.id ?? null);

console.log('All tournament logic tests passed.');
