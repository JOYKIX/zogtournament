import { GuestCamPublisher } from '../webrtc/guest-client.js';

const guestNameInput = document.getElementById('guestName');
const enableCameraBtn = document.getElementById('enableCameraBtn');
const joinGuestBtn = document.getElementById('joinGuestBtn');
const leaveGuestBtn = document.getElementById('leaveGuestBtn');
const guestStatus = document.getElementById('guestStatus');
const guestPreview = document.getElementById('guestPreview');

const publisher = new GuestCamPublisher({
  onState: (state) => {
    const labelMap = {
      idle: 'Déconnecté',
      'camera-ready': 'Caméra active, prêt à rejoindre',
      connected: 'Connecté à la régie',
    };
    guestStatus.textContent = labelMap[state] || state;
  },
  onLog: (message) => {
    console.log('[GuestCam]', message);
  },
  onLocalStream: (stream) => {
    guestPreview.srcObject = stream;
  },
});

enableCameraBtn?.addEventListener('click', async () => {
  try {
    await publisher.enableCamera();
  } catch (error) {
    console.error(error);
    guestStatus.textContent = `Erreur caméra: ${error.message}`;
  }
});

joinGuestBtn?.addEventListener('click', async () => {
  try {
    await publisher.join(guestNameInput?.value || 'Invité');
  } catch (error) {
    console.error(error);
    guestStatus.textContent = `Erreur connexion: ${error.message}`;
  }
});

leaveGuestBtn?.addEventListener('click', async () => {
  await publisher.leave();
});

window.addEventListener('beforeunload', () => {
  publisher.leave();
});
