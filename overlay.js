import { matchesRef, onValue, overlayRef } from './firebase.js';

const leftFighter = document.getElementById('leftFighter');
const rightFighter = document.getElementById('rightFighter');

let matchesCache = [];
let currentMatchIndex = 0;

function fighterMarkup(player) {
  if (!player) {
    return '<div class="name">En attente</div>';
  }

  return `
    <img src="${player.image || 'https://placehold.co/600x800?text=No+Image'}" alt="${player.pseudo}" />
    <div class="name">${player.pseudo}</div>
    <div class="character">${player.character}</div>
  `;
}

function render() {
  const match = matchesCache[currentMatchIndex];

  leftFighter.innerHTML = fighterMarkup(match?.left);
  rightFighter.innerHTML = fighterMarkup(match?.right);
}

onValue(matchesRef, (snapshot) => {
  matchesCache = snapshot.val() || [];
  render();
});

onValue(overlayRef, (snapshot) => {
  currentMatchIndex = Number(snapshot.val()?.matchIndex || 0);
  render();
});
