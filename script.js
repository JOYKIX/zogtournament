const STORAGE_KEYS = {
  users: 'zog.users',
  session: 'zog.session',
  participants: 'zog.participants',
  matches: 'zog.matches',
};

const defaultUser = {
  username: 'zogadmin1',
  password: 'zogadmin1mdp',
};

const loginSection = document.getElementById('loginSection');
const appSection = document.getElementById('appSection');
const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const logoutBtn = document.getElementById('logoutBtn');

const participantForm = document.getElementById('participantForm');
const participantsList = document.getElementById('participantsList');
const generateBracketBtn = document.getElementById('generateBracketBtn');
const bracketContainer = document.getElementById('bracketContainer');
const openOverlayBtn = document.getElementById('openOverlayBtn');

function initUsers() {
  const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.users) || '[]');
  if (!users.some((user) => user.username === defaultUser.username)) {
    users.push(defaultUser);
    localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users));
  }
}

function getUsers() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.users) || '[]');
}

function getParticipants() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.participants) || '[]');
}

function saveParticipants(participants) {
  localStorage.setItem(STORAGE_KEYS.participants, JSON.stringify(participants));
}

function getMatches() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.matches) || '[]');
}

function saveMatches(matches) {
  localStorage.setItem(STORAGE_KEYS.matches, JSON.stringify(matches));
}

function renderParticipants() {
  const participants = getParticipants();
  participantsList.innerHTML = '';

  if (!participants.length) {
    participantsList.innerHTML = '<li>Aucun participant pour le moment.</li>';
    return;
  }

  participants.forEach((participant, index) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="participant-inline">
        <img src="${participant.image || 'https://placehold.co/72x72?text=?'}" alt="${participant.pseudo}" />
        <div>
          <strong>${index + 1}. ${participant.pseudo}</strong><br />
          <span>${participant.character}</span>
        </div>
      </div>
    `;
    participantsList.appendChild(li);
  });
}

function renderBracket() {
  const matches = getMatches();
  bracketContainer.innerHTML = '';

  if (!matches.length) {
    bracketContainer.innerHTML = '<p>Pas de match généré.</p>';
    return;
  }

  matches.forEach((match, index) => {
    const node = document.createElement('article');
    node.className = 'match';
    node.innerHTML = `
      <div>${match.left.pseudo} (${match.left.character})</div>
      <div class="vs">VS</div>
      <div>${match.right.pseudo} (${match.right.character})</div>
    `;
    node.addEventListener('click', () => setOverlayMatch(index));
    bracketContainer.appendChild(node);
  });
}

function setOverlayMatch(index) {
  localStorage.setItem('zog.overlay.matchIndex', String(index));
  localStorage.setItem('zog.overlay.updatedAt', String(Date.now()));
}

function generateMatches() {
  const participants = [...getParticipants()];

  if (participants.length < 2) {
    alert('Ajoute au moins 2 participants.');
    return;
  }

  for (let i = participants.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [participants[i], participants[j]] = [participants[j], participants[i]];
  }

  const matches = [];
  for (let i = 0; i < participants.length; i += 2) {
    if (participants[i + 1]) {
      matches.push({ left: participants[i], right: participants[i + 1] });
    }
  }

  saveMatches(matches);
  setOverlayMatch(0);
  renderBracket();
}

function openOverlayWindow() {
  window.open('overlay.html', '_blank', 'width=1280,height=720');
}

function login(username, password) {
  const user = getUsers().find((entry) => entry.username === username && entry.password === password);
  if (!user) {
    return false;
  }

  localStorage.setItem(STORAGE_KEYS.session, JSON.stringify({ username: user.username }));
  return true;
}

function logout() {
  localStorage.removeItem(STORAGE_KEYS.session);
  showLogin();
}

function showLogin() {
  loginSection.classList.remove('hidden');
  appSection.classList.add('hidden');
}

function showApp() {
  loginSection.classList.add('hidden');
  appSection.classList.remove('hidden');
  renderParticipants();
  renderBracket();
}

loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const username = String(formData.get('username') || '').trim();
  const password = String(formData.get('password') || '');

  if (login(username, password)) {
    loginMessage.textContent = '';
    showApp();
  } else {
    loginMessage.textContent = 'Identifiants invalides.';
  }
});

participantForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(participantForm);

  const participant = {
    pseudo: String(formData.get('pseudo') || '').trim(),
    character: String(formData.get('character') || '').trim(),
    image: String(formData.get('image') || '').trim(),
  };

  if (!participant.pseudo || !participant.character) {
    return;
  }

  const participants = getParticipants();
  participants.push(participant);
  saveParticipants(participants);

  participantForm.reset();
  renderParticipants();
});

generateBracketBtn.addEventListener('click', generateMatches);
openOverlayBtn.addEventListener('click', openOverlayWindow);
logoutBtn.addEventListener('click', logout);

initUsers();

if (localStorage.getItem(STORAGE_KEYS.session)) {
  showApp();
} else {
  showLogin();
}
