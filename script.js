import {
  get,
  matchesRef,
  onValue,
  overlayRef,
  participantsRef,
  profileRef,
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
const participantFormTitle = document.getElementById('participantFormTitle');
const participantsList = document.getElementById('participantsList');
const participantMessage = document.getElementById('participantMessage');
const editParticipantIdField = document.getElementById('editParticipantId');
const participantSubmitBtn = document.getElementById('participantSubmitBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const clearParticipantsBtn = document.getElementById('clearParticipantsBtn');

const generateBracketBtn = document.getElementById('generateBracketBtn');
const bracketContainer = document.getElementById('bracketContainer');
const openOverlayBtn = document.getElementById('openOverlayBtn');
const overlayPrevBtn = document.getElementById('overlayPrevBtn');
const overlayNextBtn = document.getElementById('overlayNextBtn');
const toggleOverlayModeBtn = document.getElementById('toggleOverlayModeBtn');

let usersCache = [];
let participantsCache = [];
let matchesCache = [];
let currentProfile = null;
let currentOverlay = { matchIndex: 0, mode: 'duel' };

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

function buildRounds(matches) {
  if (!Array.isArray(matches) || !matches.length) {
    return [];
  }

  const rounds = [matches];
  let cursor = matches.length;

  while (cursor > 1) {
    cursor = Math.ceil(cursor / 2);
    rounds.push(Array.from({ length: cursor }, () => ({ left: null, right: null })));
  }

  return rounds;
}

async function ensureDatabaseShape() {
  const snapshot = await get(rootRef);
  const value = snapshot.val() || {};

  if (!value.users || typeof value.users !== 'object') {
    await set(usersRef, {});
  }

  if (!value.participants || typeof value.participants !== 'object') {
    await set(participantsRef, {});
  }

  if (!Array.isArray(value.matches)) {
    await set(matchesRef, []);
  }

  if (!value.overlay || typeof value.overlay !== 'object') {
    await set(overlayRef, {
      matchIndex: 0,
      mode: 'duel',
      updatedAt: Date.now(),
    });
  } else if (value.overlay.mode !== 'duel' && value.overlay.mode !== 'tree') {
    await update(overlayRef, { mode: 'duel' });
  }

  if (value.profile === undefined) {
    await set(profileRef, null);
  }

  if (value.profiles !== undefined) {
    await remove(ref(rootRef, 'profiles'));
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

function toggleEditMode(participant = null) {
  const editing = Boolean(participant);
  participantFormTitle.textContent = editing ? 'Modifier un participant' : 'Ajouter un participant';
  participantSubmitBtn.textContent = editing ? 'Mettre à jour' : 'Ajouter';
  cancelEditBtn.classList.toggle('hidden', !editing);

  if (!editing) {
    participantForm.reset();
    editParticipantIdField.value = '';
    return;
  }

  editParticipantIdField.value = participant.id;
  participantForm.pseudo.value = participant.pseudo || '';
  participantForm.character.value = participant.character || '';
  participantForm.image.value = participant.image || '';
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
      <div class="actions row-inline">
        <button class="secondary ghost" type="button" data-edit-id="${participant.id}">Modifier</button>
        <button class="danger" type="button" data-delete-id="${participant.id}">Supprimer</button>
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

  const rounds = buildRounds(matchesCache);

  rounds.forEach((round, roundIndex) => {
    const roundCol = document.createElement('section');
    roundCol.className = 'round';

    const title = roundIndex === rounds.length - 1 ? 'Finale' : `Tour ${roundIndex + 1}`;
    roundCol.innerHTML = `<h4>${title}</h4>`;

    round.forEach((match, matchIndex) => {
      const node = document.createElement('article');
      node.className = 'match';

      if (roundIndex === 0) {
        const absoluteIndex = matchIndex;
        node.classList.toggle('active', absoluteIndex === currentOverlay.matchIndex);
        node.innerHTML = `
          <div>${escapeHtml(match.left?.pseudo || 'TBD')} (${escapeHtml(match.left?.character || '...')})</div>
          <div class="vs">VS</div>
          <div>${escapeHtml(match.right?.pseudo || 'TBD')} (${escapeHtml(match.right?.character || '...')})</div>
        `;
        node.addEventListener('click', () => setOverlayMatch(absoluteIndex));
      } else {
        node.innerHTML = `
          <div>TBD</div>
          <div class="vs">VS</div>
          <div>TBD</div>
        `;
      }

      roundCol.appendChild(node);
    });

    bracketContainer.appendChild(roundCol);
  });
}

function updateOverlayModeButton() {
  const modeLabel = currentOverlay.mode === 'tree' ? 'Arbre' : 'Duel';
  toggleOverlayModeBtn.textContent = `Mode overlay: ${modeLabel}`;
}

async function setOverlayMatch(index) {
  if (!matchesCache.length) {
    return;
  }

  const clamped = Math.max(0, Math.min(index, matchesCache.length - 1));
  await update(overlayRef, {
    matchIndex: clamped,
    updatedAt: Date.now(),
  });
}

async function shiftOverlayMatch(delta) {
  if (!matchesCache.length) {
    return;
  }

  await setOverlayMatch((currentOverlay.matchIndex || 0) + delta);
}

async function toggleOverlayMode() {
  const mode = currentOverlay.mode === 'tree' ? 'duel' : 'tree';
  await update(overlayRef, {
    mode,
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
  window.open('overlay.html', '_blank', 'width=1600,height=900');
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

  return { ok: true, message: 'Compte créé. Tu peux te connecter.' };
}

async function logout() {
  await set(profileRef, null);
  await update(overlayRef, {
    matchIndex: 0,
    mode: 'duel',
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
  updateOverlayModeButton();
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

  onValue(overlayRef, (snapshot) => {
    const value = snapshot.val() || {};
    currentOverlay = {
      matchIndex: Number(value.matchIndex || 0),
      mode: value.mode === 'tree' ? 'tree' : 'duel',
    };
    renderBracket();
    updateOverlayModeButton();
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
    participantMessage.textContent = 'Le pseudo et le personnage sont obligatoires.';
    return;
  }

  const editId = String(formData.get('editParticipantId') || '').trim();

  if (editId) {
    await update(ref(participantsRef, editId), participant);
    participantMessage.textContent = 'Participant modifié ✅';
    toggleEditMode();
    return;
  }

  const newParticipantRef = push(participantsRef);
  await set(newParticipantRef, participant);

  participantMessage.textContent = 'Participant ajouté ✅';
  toggleEditMode();
});

participantsList.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const deleteButton = target.closest('[data-delete-id]');
  const editButton = target.closest('[data-edit-id]');

  if (editButton) {
    const participantId = editButton.dataset.editId;
    const participant = participantsCache.find((item) => item.id === participantId);
    if (participant) {
      toggleEditMode(participant);
      participantMessage.textContent = `Modification de ${participant.pseudo}`;
    }
    return;
  }

  if (!deleteButton) {
    return;
  }

  const participantId = deleteButton.dataset.deleteId;
  if (!participantId) {
    return;
  }

  const participant = participantsCache.find((item) => item.id === participantId);
  if (!participant) {
    return;
  }

  const confirmed = window.confirm(`Supprimer ${participant.pseudo} ?`);
  if (!confirmed) {
    return;
  }

  const participantRef = ref(participantsRef, participantId);
  await remove(participantRef);

  participantMessage.textContent = `${participant.pseudo} supprimé ✅`;
});

cancelEditBtn.addEventListener('click', () => {
  toggleEditMode();
  participantMessage.textContent = 'Modification annulée.';
});

clearParticipantsBtn.addEventListener('click', async () => {
  if (!participantsCache.length) {
    return;
  }

  const confirmed = window.confirm('Vider tous les participants et l\'arbre ?');
  if (!confirmed) {
    return;
  }

  await set(participantsRef, {});
  await set(matchesRef, []);
  await setOverlayMatch(0);
  participantMessage.textContent = 'Participants vidés.';
});

generateBracketBtn.addEventListener('click', () => {
  generateMatches();
});

overlayPrevBtn.addEventListener('click', () => shiftOverlayMatch(-1));
overlayNextBtn.addEventListener('click', () => shiftOverlayMatch(1));
toggleOverlayModeBtn.addEventListener('click', () => toggleOverlayMode());
openOverlayBtn.addEventListener('click', openOverlayWindow);
logoutBtn.addEventListener('click', () => {
  logout();
});

try {
  await ensureDatabaseShape();
} catch (error) {
  console.error('Impossible d’initialiser la base de données', error);
}
bindRealtimeSubscriptions();
showLogin();
