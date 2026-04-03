import { matchesRef, onValue, overlayRef } from './firebase.js';

const duelView = document.getElementById('duelView');
const treeView = document.getElementById('treeView');
const overlayTreeContainer = document.getElementById('overlayTreeContainer');
const leftFighter = document.getElementById('leftFighter');
const rightFighter = document.getElementById('rightFighter');

let matchesCache = [];
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

function buildRounds(matches) {
  if (!Array.isArray(matches) || !matches.length) {
    return [];
  }

  const rounds = [matches];
  let size = matches.length;
  while (size > 1) {
    size = Math.ceil(size / 2);
    rounds.push(Array.from({ length: size }, () => ({ left: null, right: null })));
  }

  return rounds;
}

function renderTree() {
  overlayTreeContainer.innerHTML = '';

  if (!matchesCache.length) {
    overlayTreeContainer.innerHTML = '<p>Aucun match.</p>';
    return;
  }

  const rounds = buildRounds(matchesCache);
  rounds.forEach((round, roundIndex) => {
    const col = document.createElement('section');
    col.className = 'round';

    const title = roundIndex === rounds.length - 1 ? 'Finale' : `Tour ${roundIndex + 1}`;
    col.innerHTML = `<h3>${title}</h3>`;

    round.forEach((match, matchIndex) => {
      const card = document.createElement('article');
      card.className = 'overlay-match';

      if (roundIndex === 0 && matchIndex === currentMatchIndex) {
        card.classList.add('active');
      }

      const left = escapeHtml(match.left?.pseudo || 'TBD');
      const right = escapeHtml(match.right?.pseudo || 'TBD');
      card.innerHTML = `<div>${left}</div><div class="vs">VS</div><div>${right}</div>`;
      col.appendChild(card);
    });

    overlayTreeContainer.appendChild(col);
  });
}

function render() {
  const match = matchesCache[currentMatchIndex];

  leftFighter.innerHTML = fighterMarkup(match?.left);
  rightFighter.innerHTML = fighterMarkup(match?.right);

  const treeMode = currentMode === 'tree';
  duelView.classList.toggle('hidden', treeMode);
  treeView.classList.toggle('hidden', !treeMode);

  renderTree();
}

onValue(matchesRef, (snapshot) => {
  matchesCache = Array.isArray(snapshot.val()) ? snapshot.val() : [];
  render();
});

onValue(overlayRef, (snapshot) => {
  const value = snapshot.val() || {};
  currentMatchIndex = Number(value.matchIndex || 0);
  currentMode = value.mode === 'tree' ? 'tree' : 'duel';
  render();
});
