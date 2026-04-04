import { matchesRef, onValue, overlayRef } from '../shared/firebase.js';
import { computeWinner, getOverlayMatches, getRoundTitle, normalizeTournament } from '../shared/tournament.js';
import { escapeHtml } from '../shared/view-helpers.js';
import { GuestCamOverlayReceiver } from '../webrtc/overlay-room.js';

const overlayTreeContainer = document.getElementById('overlayTreeContainer');
const guestCamsLayer = document.querySelector('.guest-cams-layer');
const guestSlot1 = document.getElementById('guestSlot1');
const guestSlot2 = document.getElementById('guestSlot2');
const guestSlot3 = document.getElementById('guestSlot3');
const guestVideo1 = document.getElementById('guestVideo1');
const guestVideo2 = document.getElementById('guestVideo2');
const guestVideo3 = document.getElementById('guestVideo3');
const guestAudio1 = document.getElementById('guestAudio1');
const guestAudio2 = document.getElementById('guestAudio2');
const guestAudio3 = document.getElementById('guestAudio3');

const BASE_MATCH_CENTER = 150;
const DEFAULT_GUEST_CAM_OFFSET_Y_PX = 0;
const DEFAULT_GUEST_CAM_WIDTH_PX = 320;
const DEFAULT_GUEST_CAM_HEIGHT_PX = 180;

let tournamentCache = null;
let currentMatchIndex = 0;
let currentGuestCamOffsetYPx = DEFAULT_GUEST_CAM_OFFSET_Y_PX;
let currentGuestCamWidthPx = DEFAULT_GUEST_CAM_WIDTH_PX;
let currentGuestCamHeightPx = DEFAULT_GUEST_CAM_HEIGHT_PX;

const slotNodes = {
  slot1: { wrapper: guestSlot1, video: guestVideo1, audio: guestAudio1 },
  slot2: { wrapper: guestSlot2, video: guestVideo2, audio: guestAudio2 },
  slot3: { wrapper: guestSlot3, video: guestVideo3, audio: guestAudio3 },
};

function sanitizeGuestCamOffsetY(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_GUEST_CAM_OFFSET_Y_PX;
  }

  return Math.round(parsed);
}

function sanitizeGuestCamWidth(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_GUEST_CAM_WIDTH_PX;
  }

  return Math.max(120, Math.min(920, Math.round(parsed)));
}

function sanitizeGuestCamHeight(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_GUEST_CAM_HEIGHT_PX;
  }

  return Math.max(80, Math.min(520, Math.round(parsed)));
}

function createMatchCard(match, roundIndex, matchIndex, flatMatches, hasNextRound) {
  const winner = computeWinner(match);
  const overlayIndex = flatMatches.findIndex(
    (entry) => entry.roundIndex === roundIndex && entry.matchIndex === matchIndex,
  );

  const shell = document.createElement('div');
  shell.className = 'tree-match-shell';

  if (hasNextRound) {
    shell.classList.add('has-next-round');
    if (matchIndex % 2 === 0) {
      shell.classList.add('pair-start');
    }
  }

  const card = document.createElement('article');
  card.className = 'tree-match-card';

  if (overlayIndex === currentMatchIndex) {
    card.classList.add('is-active');
  }

  const leftName = escapeHtml(match.left?.pseudo || 'En attente');
  const rightName = escapeHtml(match.right?.pseudo || 'En attente');

  card.innerHTML = `
    <div class="seed ${winner.side === 'left' ? 'winner' : ''}">${leftName}</div>
    <div class="seed ${winner.side === 'right' ? 'winner' : ''}">${rightName}</div>
  `;

  shell.appendChild(card);
  return shell;
}

function createRoundColumn(round, roundIndex, totalRounds, flatMatches) {
  const stepMultiplier = 2 ** roundIndex;
  const hasNextRound = roundIndex < totalRounds - 1;

  const column = document.createElement('section');
  column.className = 'bracket-round';
  column.style.setProperty('--step-multiplier', String(stepMultiplier));

  const heading = document.createElement('h3');
  heading.className = 'round-title';
  heading.textContent = getRoundTitle(roundIndex, totalRounds);
  column.appendChild(heading);

  const stack = document.createElement('div');
  stack.className = 'round-stack';

  round.forEach((match, matchIndex) => {
    stack.appendChild(createMatchCard(match, roundIndex, matchIndex, flatMatches, hasNextRound));
  });

  column.appendChild(stack);
  return column;
}

function renderTree() {
  overlayTreeContainer.innerHTML = '';

  if (!tournamentCache?.rounds?.length) {
    overlayTreeContainer.innerHTML = '<p class="empty">Aucun match.</p>';
    return;
  }

  const rounds = tournamentCache.rounds;
  const flatMatches = getOverlayMatches(tournamentCache);

  overlayTreeContainer.style.setProperty('--round-count', String(rounds.length));
  overlayTreeContainer.style.setProperty('--base-match-center', `${BASE_MATCH_CENTER}px`);

  rounds.forEach((round, roundIndex) => {
    overlayTreeContainer.appendChild(createRoundColumn(round, roundIndex, rounds.length, flatMatches));
  });

  if (guestCamsLayer) {
    guestCamsLayer.style.setProperty('--guest-cams-offset-y', `${currentGuestCamOffsetYPx}px`);
    guestCamsLayer.style.setProperty('--guest-cam-width-px', `${currentGuestCamWidthPx}px`);
    guestCamsLayer.style.setProperty('--guest-cam-height-px', `${currentGuestCamHeightPx}px`);
  }
}

onValue(matchesRef, (snapshot) => {
  tournamentCache = normalizeTournament(snapshot.val());
  renderTree();
});

onValue(overlayRef, (snapshot) => {
  const value = snapshot.val() || {};
  currentMatchIndex = Number(value.matchIndex || 0);
  currentGuestCamOffsetYPx = sanitizeGuestCamOffsetY(value.guestCamOffsetYPx);
  currentGuestCamWidthPx = sanitizeGuestCamWidth(value.guestCamWidthPx);
  currentGuestCamHeightPx = sanitizeGuestCamHeight(value.guestCamHeightPx);
  renderTree();
});

const overlayReceiver = new GuestCamOverlayReceiver({
  onSlotUpdate: (slotId, stream, isVisible, meta = {}) => {
    const slot = slotNodes[slotId];
    if (!slot?.wrapper || !slot.video || !slot.audio) {
      return;
    }

    slot.wrapper.classList.toggle('is-visible', Boolean(isVisible));
    slot.video.srcObject = stream || null;
    slot.video.muted = true;
    slot.audio.srcObject = stream || null;
    slot.audio.muted = !meta.includeOverlayAudio;
    slot.audio.volume = meta.includeOverlayAudio ? 1 : 0;

    if (!stream) {
      return;
    }

    slot.video.play().catch(() => {
      // Certains navigateurs bloquent l'autoplay vidéo sans interaction utilisateur.
    });
    slot.audio.play().catch(() => {
      // Certains navigateurs bloquent l'autoplay audio sans interaction utilisateur.
    });
  },
  onLog: (message) => {
    console.log('[OverlayTreeCam]', message);
  },
});
overlayReceiver.start();

window.addEventListener('beforeunload', () => {
  overlayReceiver.stop();
});
