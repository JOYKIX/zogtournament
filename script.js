import {
  matchesRef,
  onValue,
  overlayRef,
  participantsRef,
  push,
  ref,
  remove,
  set,
  update,
  usersRef,
} from './firebase.js';

const STORAGE_KEYS = {
  session: 'zog.session',
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

let usersCache = [];
let participantsCache = [];
let matchesCache = [];

function normalizeList(snapshotValue) {
  if (!snapshotValue) {
    return [];
  }

  return Object.values(snapshotValue);
}

function renderParticipants() {
  participantsList.innerHTML = '';

  if (!participantsCache.length) {
    participantsList.innerHTML = '<li>Aucun participant pour le moment.</li>';
    return;
  }

  participantsCache.forEach((participant, index) => {
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
  bracketContainer.innerHTML = '';

  if (!matchesCache.length) {
    bracketContainer.innerHTML = '<p>Pas de match généré.</p>';
    return;
  }

  matchesCache.forEach((match, index) => {
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

async function setOverlayMatch(index) {
  await update(overlayRef, {
    matchIndex: index,
    updatedAt: Date.now(),
  });
}

async function generateMatches() {
  const participants = [...participantsCache];

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

  await set(matchesRef, matches);
  await setOverlayMatch(0);
}

function openOverlayWindow() {
  window.open('overlay.html', '_blank', 'width=1280,height=720');
}

function login(username, password) {
  const user = usersCache.find((entry) => entry.username === username && entry.password === password);
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

function bindRealtimeSubscriptions() {
  onValue(usersRef, async (snapshot) => {
    const usersMap = snapshot.val() || {};
    usersCache = Object.values(usersMap);

    if (!usersMap[defaultUser.username]) {
      const defaultUserRef = ref(usersRef, defaultUser.username);
      await set(defaultUserRef, defaultUser);
      return;
    }

    const session = localStorage.getItem(STORAGE_KEYS.session);
    if (!session) {
      return;
    }

    const { username } = JSON.parse(session);
    if (!usersMap[username]) {
      logout();
    }
  });

  onValue(participantsRef, (snapshot) => {
    participantsCache = normalizeList(snapshot.val());
    renderParticipants();
  });

  onValue(matchesRef, (snapshot) => {
    matchesCache = normalizeList(snapshot.val());
    renderBracket();
  });
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

participantForm.addEventListener('submit', async (event) => {
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

  const newParticipantRef = push(participantsRef);
  await set(newParticipantRef, participant);

  participantForm.reset();
});

generateBracketBtn.addEventListener('click', () => {
  generateMatches();
});
openOverlayBtn.addEventListener('click', openOverlayWindow);
logoutBtn.addEventListener('click', logout);

bindRealtimeSubscriptions();

if (localStorage.getItem(STORAGE_KEYS.session)) {
  showApp();
} else {
  showLogin();
}

window.addEventListener('beforeunload', () => {
  if (!localStorage.getItem(STORAGE_KEYS.session)) {
    remove(overlayRef);
  }
});
