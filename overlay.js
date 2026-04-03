const leftFighter = document.getElementById('leftFighter');
const rightFighter = document.getElementById('rightFighter');

function getMatches() {
  return JSON.parse(localStorage.getItem('zog.matches') || '[]');
}

function getCurrentMatchIndex() {
  return Number(localStorage.getItem('zog.overlay.matchIndex') || 0);
}

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
  const matches = getMatches();
  const match = matches[getCurrentMatchIndex()];

  leftFighter.innerHTML = fighterMarkup(match?.left);
  rightFighter.innerHTML = fighterMarkup(match?.right);
}

window.addEventListener('storage', (event) => {
  if (event.key === 'zog.overlay.updatedAt' || event.key === 'zog.matches') {
    render();
  }
});

render();
