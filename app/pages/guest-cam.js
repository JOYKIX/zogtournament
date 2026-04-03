import { GuestCamPublisher } from '../webrtc/guest-client.js';

const guestNameInput = document.getElementById('guestName');
const enableCameraBtn = document.getElementById('enableCameraBtn');
const joinGuestBtn = document.getElementById('joinGuestBtn');
const leaveGuestBtn = document.getElementById('leaveGuestBtn');
const guestStatus = document.getElementById('guestStatus');
const guestPreview = document.getElementById('guestPreview');
const guestVoicePeers = document.getElementById('guestVoicePeers');
const microphoneSelect = document.getElementById('microphoneSelect');
const refreshMicrophonesBtn = document.getElementById('refreshMicrophonesBtn');
const peerAudioEls = new Map();

const publisher = new GuestCamPublisher({
  onState: (state) => {
    const labelMap = {
      idle: 'Déconnecté',
      'camera-ready': 'Caméra + micro actifs, prêt à rejoindre',
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
  onVoicePeerStream: (peerId, stream) => {
    const existing = peerAudioEls.get(peerId);
    if (!stream) {
      existing?.remove();
      peerAudioEls.delete(peerId);
      return;
    }

    if (existing) {
      existing.srcObject = stream;
      return;
    }

    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.playsInline = true;
    audio.dataset.peerId = peerId;
    audio.srcObject = stream;
    peerAudioEls.set(peerId, audio);
    guestVoicePeers?.appendChild(audio);
  },
});

async function refreshMicrophones() {
  const devices = await publisher.listAudioInputs();
  const options = ['<option value="">Micro par défaut</option>'];
  for (const [index, device] of devices.entries()) {
    const safeLabel = (device.label || `Microphone ${index + 1}`).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const selected = device.deviceId === microphoneSelect?.value ? ' selected' : '';
    options.push(`<option value="${device.deviceId}"${selected}>${safeLabel}</option>`);
  }
  if (microphoneSelect) {
    microphoneSelect.innerHTML = options.join('');
  }
}

refreshMicrophones().catch(() => {
  // Les labels de périphériques peuvent être vides avant la permission micro.
});

microphoneSelect?.addEventListener('change', () => {
  publisher.setAudioInput(microphoneSelect.value);
});

refreshMicrophonesBtn?.addEventListener('click', async () => {
  try {
    await refreshMicrophones();
    guestStatus.textContent = 'Liste des microphones mise à jour.';
  } catch (error) {
    console.error(error);
    guestStatus.textContent = `Erreur microphones: ${error.message}`;
  }
});

enableCameraBtn?.addEventListener('click', async () => {
  try {
    await publisher.enableCamera();
    await refreshMicrophones();
  } catch (error) {
    console.error(error);
    guestStatus.textContent = `Erreur caméra/micro: ${error.message}`;
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
