import { get, getProductRefsBySlug, onValue, push, ref, remove, set, update } from '../shared/firebase.js';
import { isValidPseudo, normalizeCode, normalizePseudo } from '../shared/validation.js';

const params = new URLSearchParams(window.location.search);
const profileId = String(params.get('profile') || '').trim() || null;
const product = String(params.get('product') || 'quiz').trim().toLowerCase();
const activeProductRefs = getProductRefsBySlug(product, profileId);

const joinForm = document.getElementById('buzzerJoinForm');
const inviteCodeInput = document.getElementById('inviteCode');
const pseudoInput = document.getElementById('buzzerPseudo');
const message = document.getElementById('buzzerMessage');
const panel = document.getElementById('buzzerPanel');
const statusEl = document.getElementById('buzzerStatus');
const buzzBtn = document.getElementById('buzzBtn');

const roundRef = ref(activeProductRefs.productRootRef, 'round1');
const inviteCodesRef = ref(roundRef, 'inviteCodes');
const participantsRef = ref(roundRef, 'buzzer/participants');
const currentBuzzRef = ref(roundRef, 'buzzer/currentBuzz');
const questionStateRef = ref(roundRef, 'buzzer/questionState');

let session = null;
let currentBuzz = null;
let questionState = { open: true, blocked: {} };
let isSubmittingJoin = false;
let isBuzzing = false;

function setMessage(text, tone = '') {
  message.textContent = text;
  message.className = `message ${tone}`.trim();
}

async function tryBuzz() {
  if (!session || isBuzzing) {
    return;
  }

  const blocked = Boolean(questionState?.blocked?.[session.id]);
  if (!questionState?.open || blocked || currentBuzz) {
    return;
  }

  isBuzzing = true;
  buzzBtn.disabled = true;
  try {
    await set(currentBuzzRef, {
      participantId: session.id,
      pseudo: session.pseudo,
      at: Date.now(),
    });
  } finally {
    isBuzzing = false;
    renderState();
  }
}

function renderState() {
  if (!session) {
    return;
  }

  const blocked = Boolean(questionState?.blocked?.[session.id]);
  if (currentBuzz?.participantId === session.id) {
    statusEl.textContent = '🎯 Tu as la main.';
    buzzBtn.disabled = true;
    return;
  }

  if (currentBuzz && currentBuzz.participantId !== session.id) {
    statusEl.textContent = `⏳ ${currentBuzz.pseudo || 'Un joueur'} a buzzé.`;
    buzzBtn.disabled = true;
    return;
  }

  if (!questionState?.open) {
    statusEl.textContent = 'Question verrouillée.';
    buzzBtn.disabled = true;
    return;
  }

  if (blocked) {
    statusEl.textContent = 'Réponse fausse: tu ne peux plus répondre à cette question.';
    buzzBtn.disabled = true;
    return;
  }

  statusEl.textContent = 'Prêt à buzzer (Espace).';
  buzzBtn.disabled = false;
}

async function cleanupSession() {
  if (!session?.id) {
    return;
  }

  const participantId = session.id;
  session = null;

  try {
    await remove(ref(participantsRef, participantId));
  } catch {
    // Nettoyage best effort.
  }
}

joinForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (isSubmittingJoin) {
    return;
  }

  const code = normalizeCode(inviteCodeInput.value);
  const pseudo = normalizePseudo(pseudoInput.value);

  if (!code || !pseudo) {
    setMessage('Code et pseudo obligatoires.', 'error');
    return;
  }

  if (!isValidPseudo(pseudo)) {
    setMessage('Pseudo invalide (3-24 caractères, lettres/chiffres/_/-).', 'error');
    return;
  }

  isSubmittingJoin = true;
  setMessage('Vérification du code…');

  try {
    const snapshot = await get(inviteCodesRef);
    const value = snapshot.val() || {};
    const matchedKey =
      Object.entries(value).find(([, entry]) => String(entry?.code || '').toUpperCase() === code)?.[0] || null;

    if (!matchedKey) {
      setMessage('Code invalide ou déjà utilisé.', 'error');
      return;
    }

    const participantRef = push(participantsRef);
    session = { id: participantRef.key, pseudo };
    await set(participantRef, {
      pseudo,
      joinedAt: Date.now(),
    });

    await remove(ref(inviteCodesRef, matchedKey));
    await update(questionStateRef, {
      open: true,
      [`blocked/${session.id}`]: false,
    });

    joinForm.classList.add('hidden');
    panel.classList.remove('hidden');
    setMessage('Connecté.');
    renderState();
  } finally {
    isSubmittingJoin = false;
  }
});

buzzBtn.addEventListener('click', () => {
  tryBuzz();
});

document.addEventListener('keydown', (event) => {
  if (event.code !== 'Space') {
    return;
  }

  event.preventDefault();
  tryBuzz();
});

window.addEventListener('beforeunload', () => {
  cleanupSession();
});

onValue(currentBuzzRef, (snapshot) => {
  currentBuzz = snapshot.val() || null;
  renderState();
});

onValue(questionStateRef, (snapshot) => {
  questionState = snapshot.val() || { open: true, blocked: {} };
  renderState();
});
