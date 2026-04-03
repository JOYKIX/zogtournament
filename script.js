import {
  get,
  matchesRef,
  onValue,
  overlayRef,
  participantsRef,
  profileRef,
  profilesRef,
  push,
  ref,
  remove,
  rootRef,
  set,
  update,
  usersRef,
} from './firebase.js';

const MAX_ACCOUNTS = 2;
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,24}$/;

const loginSection = document.getElementById('loginSection');
const appSection = document.getElementById('appSection');
const createProfileForm = document.getElementById('createProfileForm');
const createProfileMessage = document.getElementById('createProfileMessage');
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
let currentProfile = null;

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
  if (!raw) {
    return 'https://placehold.co/72x72?text=?';
  }

  if (!/^https?:\/\//i.test(raw)) {
    return 'https://placehold.co/72x72?text=?';
  }

  return raw;
}

function normalizeUsers(snapshotValue) {
  if (!snapshotValue || typeof snapshotValue !== 'object') {
    return [];
  }

  return Object.entries(snapshotValue)
    .filter(([, user]) => user && typeof user === 'object')
    .map(([id, user]) => ({
      id,
      ...user,
    }));
}

function findUserByUsername(username) {
  const normalized = username.toLowerCase();
  return usersCache.find((user) => String(user.username || '').toLowerCase() === normalized);
}

async function ensureDatabaseShape() {
  const snapshot = await get(rootRef);
  const value = snapshot.val() || {};

  const initialPatch = {};

  if (!value.users || typeof value.users !== 'object') {
    initialPatch.users = {};
  }

  if (!value.profiles || typeof value.profiles !== 'object') {
    initialPatch.profiles = {};
  }

  if (!value.participants || typeof value.participants !== 'object') {
    initialPatch.participants = {};
  }

  if (!Array.isArray(value.matches)) {
    initialPatch.matches = [];
  }

  if (!value.overlay || typeof value.overlay !== 'object') {
    initialPatch.overlay = {
      matchIndex: 0,
      updatedAt: Date.now(),
    };
  }

  if (value.profile === undefined) {
    initialPatch.profile = null;
  }

  if (Object.keys(initialPatch).length) {
    await update(rootRef, initialPatch);
  }
}

function normalizeParticipants(snapshotValue) {
  if (!snapshotValue || typeof snapshotValue !== 'object') {
    return [];
  }

  return Object.entries(snapshotValue)
    .filter(([, participant]) => participant && typeof participant === 'object')
    .map(([id, participant]) => ({
      id,
      ...participant,
    }));
}

function normalizeMatches(snapshotValue) {
  if (!Array.isArray(snapshotValue)) {
    return [];
  }

  return snapshotValue.filter((match) => match?.left?.pseudo && match?.right?.pseudo);
}

function renderParticipants() {
  participantsList.innerHTML = '';

  if (!participantsCache.length) {
    participantsList.innerHTML = '<li>Aucun participant pour le moment.</li>';
    return;
  }

  participantsCache.forEach((participant, index) => {
    const li = document.createElement('li');
    const safePseudo = escapeHtml(participant.pseudo || '');
    const safeCharacter = escapeHtml(participant.character || '');

    li.innerHTML = `
      <div class="participant-inline">
        <img src="${normalizeImageUrl(participant.image)}" alt="${safePseudo}" />
        <div>
          <strong>${index + 1}. ${safePseudo}</strong><br />
          <span>${safeCharacter}</span>
        </div>
      </div>
      <button class="danger" type="button" data-delete-id="${participant.id}">Supprimer</button>
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
      <div>${escapeHtml(match.left.pseudo)} (${escapeHtml(match.left.character)})</div>
      <div class="vs">VS</div>
      <div>${escapeHtml(match.right.pseudo)} (${escapeHtml(match.right.character)})</div>
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
  const participants = participantsCache.map(({ id, ...participant }) => participant);

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

async function login(username, password) {
  if (!username || !password) {
    return false;
  }

  const user = findUserByUsername(username);
  if (!user || user.password !== password) {
    return false;
  }

  await set(profileRef, {
    uid: user.id,
    username: user.username,
    loggedAt: Date.now(),
  });

  return true;
}

async function createProfile(username, password) {
  if (!username || !password) {
    return { ok: false, message: 'Identifiant et mot de passe obligatoires.' };
  }

  if (!USERNAME_REGEX.test(username)) {
    return {
      ok: false,
      message: 'Identifiant invalide (3-24 caractères: lettres, chiffres, _ ou -).',
    };
  }

  if (password.length < 6) {
    return { ok: false, message: 'Mot de passe trop court (6 caractères minimum).' };
  }

  if (findUserByUsername(username)) {
    return { ok: false, message: 'Ce nom de compte existe déjà.' };
  }

  if (usersCache.length >= MAX_ACCOUNTS) {
    return { ok: false, message: 'Limite atteinte : 2 comptes maximum.' };
  }

  const userRef = push(usersRef);
  const uid = userRef.key;

  if (!uid) {
    return { ok: false, message: 'Erreur interne: uid utilisateur introuvable.' };
  }

  const now = Date.now();

  await set(userRef, {
    username,
    password,
    createdAt: now,
  });

  await set(ref(profilesRef, uid), {
    username,
    displayName: username,
    createdAt: now,
    updatedAt: now,
  });

  return { ok: true, message: 'Compte et profil Firebase créés. Tu peux te connecter.' };
}

async function logout() {
  await set(profileRef, null);
  await update(overlayRef, {
    matchIndex: 0,
    updatedAt: Date.now(),
  });
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
    usersCache = normalizeUsers(usersMap);

    if (currentProfile?.uid && !usersMap[currentProfile.uid]) {
      await logout();
    }
  });

  onValue(profileRef, (snapshot) => {
    currentProfile = snapshot.val();

    if (currentProfile?.username) {
      showApp();
      return;
    }

    showLogin();
  });

  onValue(participantsRef, (snapshot) => {
    participantsCache = normalizeParticipants(snapshot.val());
    renderParticipants();
  });

  onValue(matchesRef, (snapshot) => {
    matchesCache = normalizeMatches(snapshot.val());
    renderBracket();
  });
}

createProfileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(createProfileForm);
  const username = String(formData.get('newUsername') || '').trim();
  const password = String(formData.get('newPassword') || '');

  const result = await createProfile(username, password);
  createProfileMessage.textContent = result.message;

  if (result.ok) {
    createProfileForm.reset();
  }
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const username = String(formData.get('username') || '').trim();
  const password = String(formData.get('password') || '');

  if (await login(username, password)) {
    loginMessage.textContent = '';
    loginForm.reset();
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

participantsList.addEventListener('click', async (event) => {
  const deleteButton = event.target.closest('[data-delete-id]');
  if (!deleteButton) {
    return;
  }

  const participantId = deleteButton.dataset.deleteId;
  if (!participantId) {
    return;
  }

  const participantRef = ref(participantsRef, participantId);
  await remove(participantRef);
});

generateBracketBtn.addEventListener('click', () => {
  generateMatches();
});
openOverlayBtn.addEventListener('click', openOverlayWindow);
logoutBtn.addEventListener('click', () => {
  logout();
});

await ensureDatabaseShape();
bindRealtimeSubscriptions();
showLogin();
