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
let tournamentCache = null;
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

function findUserByUsername(username) {
  const normalized = username.toLowerCase();
  return usersCache.find((user) => String(user.username || '').toLowerCase() === normalized);
}

function getRoundTitle(roundIndex, totalRounds) {
  const roundsUntilFinal = totalRounds - roundIndex;

  if (roundsUntilFinal === 1) {
    return 'Finale';
  }

  if (roundsUntilFinal === 2) {
    return 'Demi-finales';
  }

  if (roundsUntilFinal === 3) {
    return 'Quarts de finale';
  }

  if (roundsUntilFinal === 4) {
    return 'Huitièmes de finale';
  }

  if (roundsUntilFinal === 5) {
    return 'Seizièmes de finale';
  }

  return `Tour ${roundIndex + 1}`;
}

function emptyMatch() {
  return {
    left: null,
    right: null,
    winnerSide: null,
  };
}

function cloneMatch(match) {
  return {
    left: match?.left || null,
    right: match?.right || null,
    winnerSide: match?.winnerSide === 'left' || match?.winnerSide === 'right' ? match.winnerSide : null,
  };
}

function nextPowerOfTwo(value) {
  let power = 1;
  while (power < value) {
    power *= 2;
  }
  return power;
}

function shuffleParticipants(participants) {
  const shuffled = [...participants];

  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

function computeWinner(match) {
  const left = match.left;
  const right = match.right;

  if (!left && !right) {
    return { side: null, player: null };
  }

  if (left && !right) {
    return { side: 'left', player: left };
  }

  if (!left && right) {
    return { side: 'right', player: right };
  }

  if (match.winnerSide === 'left') {
    return { side: 'left', player: left };
  }

  if (match.winnerSide === 'right') {
    return { side: 'right', player: right };
  }

  return { side: null, player: null };
}

function rebuildTournament(rawTournament) {
  if (!rawTournament || !Array.isArray(rawTournament.rounds) || !rawTournament.rounds.length) {
    return null;
  }

  const rounds = rawTournament.rounds.map((round) => (Array.isArray(round) ? round.map(cloneMatch) : []));

  for (let roundIndex = 0; roundIndex < rounds.length - 1; roundIndex += 1) {
    const currentRound = rounds[roundIndex];
    const nextRound = rounds[roundIndex + 1];

    nextRound.forEach((match) => {
      match.left = null;
      match.right = null;
    });

    currentRound.forEach((match, matchIndex) => {
      const winner = computeWinner(match);
      match.winnerSide = winner.side;

      if (!winner.player) {
        return;
      }

      const targetMatch = nextRound[Math.floor(matchIndex / 2)];
      if (!targetMatch) {
        return;
      }

      if (matchIndex % 2 === 0) {
        targetMatch.left = winner.player;
      } else {
        targetMatch.right = winner.player;
      }
    });
  }

  const championMatch = rounds[rounds.length - 1][0] || emptyMatch();
  const champion = computeWinner(championMatch).player;

  return {
    rounds,
    generatedAt: rawTournament.generatedAt || Date.now(),
    champion,
  };
}

function normalizeTournament(snapshotValue) {
  if (!snapshotValue) {
    return null;
  }

  if (Array.isArray(snapshotValue)) {
    const legacyRound = snapshotValue
      .filter((match) => match?.left?.pseudo && match?.right?.pseudo)
      .map((match) => ({
        left: match.left,
        right: match.right,
        winnerSide: null,
      }));

    if (!legacyRound.length) {
      return null;
    }

    const tournament = {
      rounds: [legacyRound],
      generatedAt: Date.now(),
    };

    return rebuildTournament(tournament);
  }

  return rebuildTournament(snapshotValue);
}

function getOverlayMatches(tournament) {
  if (!tournament || !Array.isArray(tournament.rounds)) {
    return [];
  }

  const items = [];
  tournament.rounds.forEach((round, roundIndex) => {
    round.forEach((match, matchIndex) => {
      if (!match.left && !match.right) {
        return;
      }

      items.push({
        roundIndex,
        matchIndex,
        ...match,
      });
    });
  });

  return items;
}

function getCurrentOverlayMeta() {
  const flatMatches = getOverlayMatches(tournamentCache);
  const safeIndex = Math.max(0, Math.min(currentOverlay.matchIndex || 0, Math.max(flatMatches.length - 1, 0)));
  return {
    flatMatches,
    safeIndex,
    current: flatMatches[safeIndex] || null,
  };
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

  if (!tournamentCache?.rounds?.length) {
    bracketContainer.innerHTML = '<p>Pas de bracket généré.</p>';
    return;
  }

  const { flatMatches, safeIndex, current } = getCurrentOverlayMeta();

  tournamentCache.rounds.forEach((round, roundIndex) => {
    const roundCol = document.createElement('section');
    roundCol.className = 'round';

    const title = getRoundTitle(roundIndex, tournamentCache.rounds.length);
    roundCol.innerHTML = `<h4>${title}</h4>`;

    round.forEach((match, matchIndex) => {
      const node = document.createElement('article');
      node.className = 'match';

      const overlayIndex = flatMatches.findIndex(
        (entry) => entry.roundIndex === roundIndex && entry.matchIndex === matchIndex,
      );

      if (overlayIndex !== -1 && overlayIndex === safeIndex) {
        node.classList.add('active');
      }

      const winner = computeWinner(match);
      const leftName = escapeHtml(match.left?.pseudo || 'En attente');
      const rightName = escapeHtml(match.right?.pseudo || 'En attente');
      const leftCharacter = escapeHtml(match.left?.character || '—');
      const rightCharacter = escapeHtml(match.right?.character || '—');

      node.innerHTML = `
        <button type="button" class="slot ${winner.side === 'left' ? 'is-winner' : ''}" data-side="left">
          <span class="slot-name">${leftName}</span>
          <span class="slot-character">${leftCharacter}</span>
        </button>
        <div class="vs">VS</div>
        <button type="button" class="slot ${winner.side === 'right' ? 'is-winner' : ''}" data-side="right">
          <span class="slot-name">${rightName}</span>
          <span class="slot-character">${rightCharacter}</span>
        </button>
        <button type="button" class="ghost select-overlay" data-overlay-index="${overlayIndex}">Afficher en duel</button>
      `;

      const [leftBtn, rightBtn] = node.querySelectorAll('.slot');
      const overlayBtn = node.querySelector('.select-overlay');

      if (!match.left || !match.right) {
        leftBtn.disabled = true;
        rightBtn.disabled = true;
      }

      leftBtn.addEventListener('click', () => setWinner(roundIndex, matchIndex, 'left'));
      rightBtn.addEventListener('click', () => setWinner(roundIndex, matchIndex, 'right'));

      if (overlayBtn) {
        if (overlayIndex === -1) {
          overlayBtn.disabled = true;
          overlayBtn.textContent = 'Pas prêt';
        } else {
          overlayBtn.addEventListener('click', () => setOverlayMatch(overlayIndex));
        }
      }

      roundCol.appendChild(node);
    });

    bracketContainer.appendChild(roundCol);
  });

  if (tournamentCache.champion?.pseudo) {
    const championNode = document.createElement('div');
    championNode.className = 'champion-banner';
    championNode.innerHTML = `🏆 Vainqueur: <strong>${escapeHtml(tournamentCache.champion.pseudo)}</strong> (${escapeHtml(
      tournamentCache.champion.character || '—',
    )})`;
    bracketContainer.appendChild(championNode);
  } else if (current) {
    const helpNode = document.createElement('p');
    helpNode.className = 'hint';
    helpNode.textContent = 'Clique sur un joueur dans chaque match pour le faire avancer.';
    bracketContainer.appendChild(helpNode);
  }
}

function updateOverlayModeButton() {
  const modeLabel = currentOverlay.mode === 'tree' ? 'Arbre' : 'Duel';
  toggleOverlayModeBtn.textContent = `Mode overlay: ${modeLabel}`;
}

async function setOverlayMatch(index) {
  const { flatMatches } = getCurrentOverlayMeta();
  if (!flatMatches.length) {
    return;
  }

  const clamped = Math.max(0, Math.min(index, flatMatches.length - 1));
  await update(overlayRef, {
    matchIndex: clamped,
    updatedAt: Date.now(),
  });
}

async function shiftOverlayMatch(delta) {
  const { safeIndex, flatMatches } = getCurrentOverlayMeta();
  if (!flatMatches.length) {
    return;
  }

  await setOverlayMatch(safeIndex + delta);
}

async function toggleOverlayMode() {
  const mode = currentOverlay.mode === 'tree' ? 'duel' : 'tree';
  await update(overlayRef, {
    mode,
    updatedAt: Date.now(),
  });
}

function createTournament(participants) {
  const sanitized = shuffleParticipants(
    participants.map(({ id, ...participant }) => ({
      pseudo: participant.pseudo,
      character: participant.character,
      image: participant.image || '',
    })),
  );

  const bracketSize = nextPowerOfTwo(sanitized.length);
  const roundsCount = Math.log2(bracketSize);

  const rounds = Array.from({ length: roundsCount }, (_, roundIndex) => {
    const matchesInRound = bracketSize / 2 ** (roundIndex + 1);
    return Array.from({ length: matchesInRound }, () => emptyMatch());
  });

  const firstRound = rounds[0];
  for (let i = 0; i < bracketSize; i += 2) {
    const matchIndex = i / 2;
    firstRound[matchIndex].left = sanitized[i] || null;
    firstRound[matchIndex].right = sanitized[i + 1] || null;
  }

  return rebuildTournament({ rounds, generatedAt: Date.now() });
}

async function generateMatches() {
  if (participantsCache.length < 2) {
    alert('Ajoute au moins 2 participants.');
    return;
  }

  const tournament = createTournament(participantsCache);
  await set(matchesRef, tournament);
  await setOverlayMatch(0);
}

async function setWinner(roundIndex, matchIndex, side) {
  if (!tournamentCache?.rounds?.[roundIndex]?.[matchIndex]) {
    return;
  }

  const tournament = {
    ...tournamentCache,
    rounds: tournamentCache.rounds.map((round) => round.map(cloneMatch)),
  };

  const targetMatch = tournament.rounds[roundIndex][matchIndex];
  if (!targetMatch.left || !targetMatch.right) {
    return;
  }

  targetMatch.winnerSide = side;
  const rebuilt = rebuildTournament(tournament);
  await set(matchesRef, rebuilt);
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

async function ensureDatabaseShape() {
  const snapshot = await get(rootRef);
  const value = snapshot.val() || {};

  if (!value.users || typeof value.users !== 'object') {
    await set(usersRef, {});
  }

  if (!value.participants || typeof value.participants !== 'object') {
    await set(participantsRef, {});
  }

  if (!value.matches) {
    await set(matchesRef, null);
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
    tournamentCache = normalizeTournament(snapshot.val());
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

  const confirmed = window.confirm('Vider tous les participants et le tournoi ?');
  if (!confirmed) {
    return;
  }

  await set(participantsRef, {});
  await set(matchesRef, null);
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
