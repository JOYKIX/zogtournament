import { onValue, overlayRef } from '../shared/firebase.js';
import { GuestCamOverlayReceiver } from '../webrtc/overlay-room.js';

const camRoot = document.querySelector('.cam-root');
const guestSlot1 = document.getElementById('guestSlot1');
const guestSlot2 = document.getElementById('guestSlot2');
const guestSlot3 = document.getElementById('guestSlot3');
const guestVideo1 = document.getElementById('guestVideo1');
const guestVideo2 = document.getElementById('guestVideo2');
const guestVideo3 = document.getElementById('guestVideo3');
const guestAudio1 = document.getElementById('guestAudio1');
const guestAudio2 = document.getElementById('guestAudio2');
const guestAudio3 = document.getElementById('guestAudio3');

const DEFAULT_GUEST_CAM_OFFSET_Y_PX = 0;
const DEFAULT_GUEST_CAM_WIDTH_PX = 320;

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

onValue(overlayRef, (snapshot) => {
  const value = snapshot.val() || {};
  const offsetYPx = sanitizeGuestCamOffsetY(value.guestCamOffsetYPx);
  const widthPx = sanitizeGuestCamWidth(value.guestCamWidthPx);

  if (camRoot) {
    camRoot.style.setProperty('--guest-cams-offset-y', `${offsetYPx}px`);
    camRoot.style.setProperty('--guest-cam-width-px', `${widthPx}px`);
  }
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
    console.log('[CamOverlay]', message);
  },
});
overlayReceiver.start();

window.addEventListener('beforeunload', () => {
  overlayReceiver.stop();
});
