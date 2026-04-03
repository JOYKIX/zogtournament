import { GuestCamPublisher } from '../webrtc/guest-client.js';

const guestNameInput = document.getElementById('guestName');
const enableCameraBtn = document.getElementById('enableCameraBtn');
const joinStreamBtn = document.getElementById('joinStreamBtn');
const joinVoiceBtn = document.getElementById('joinVoiceBtn');
const leaveGuestBtn = document.getElementById('leaveGuestBtn');
const muteMicrophoneBtn = document.getElementById('muteMicrophoneBtn');
const guestStatus = document.getElementById('guestStatus');
const guestPreview = document.getElementById('guestPreview');
const guestVoicePeers = document.getElementById('guestVoicePeers');
const microphoneSelect = document.getElementById('microphoneSelect');
const refreshMicrophonesBtn = document.getElementById('refreshMicrophonesBtn');
const guestPeerList = document.getElementById('guestPeerList');
const peerAudioEls = new Map();
let peersCache = [];

function renderMuteButton(isMuted, hasAudioTrack) {
  if (!muteMicrophoneBtn) return;
  muteMicrophoneBtn.disabled = !hasAudioTrack;
  muteMicrophoneBtn.classList.toggle('is-muted', Boolean(isMuted));
  muteMicrophoneBtn.textContent = isMuted ? 'Unmute' : 'Mute';
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderPeerList() {
  if (!guestPeerList) return;

  if (!peersCache.length) {
    guestPeerList.innerHTML = '<li class="member-empty">Personne connecté pour le moment</li>';
    return;
  }

  guestPeerList.innerHTML = peersCache
    .map((peer) => {
      const isAudioActive = peerAudioEls.has(peer.id);
      const stateLabel = isAudioActive ? 'Audio actif' : peer.status === 'connected' ? 'En ligne' : 'Connexion...';
      const icon = isAudioActive ? '🟢' : '⚪';
      return `<li><div class="peer-item-row"><strong>${escapeHtml(peer.name)}</strong><span>${icon} ${stateLabel}</span></div></li>`;
    })
    .join('');
}

const publisher = new GuestCamPublisher({
  onState: (state) => {
    const labelMap = {
      idle: 'Déconnecté',
      'camera-ready': 'Caméra + micro actifs, prêt à rejoindre',
      'stream-connected': 'Connecté au flux vidéo de la régie',
      'voice-connected': 'Connecté au groupe vocal',
      connected: 'Connecté au flux + groupe vocal',
      disconnected: 'Connexion perdue, flux coupé automatiquement',
    };
    guestStatus.textContent = labelMap[state] || state;
  },
  onLog: (message) => {
    console.log('[GuestCam]', message);
  },
  onLocalStream: (stream) => {
    guestPreview.srcObject = stream;
    renderMuteButton(publisher.isMuted(), Boolean(stream?.getAudioTracks()?.[0]));
  },
  onMuteChanged: (isMuted) => {
    renderMuteButton(isMuted, publisher.hasAudioTrack());
  },
  onVoicePeerStream: (peerId, stream) => {
    const existing = peerAudioEls.get(peerId);
    if (!stream) {
      existing?.remove();
      peerAudioEls.delete(peerId);
      renderPeerList();
      return;
    }

    if (existing) {
      existing.srcObject = stream;
      renderPeerList();
      return;
    }

    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.playsInline = true;
    audio.dataset.peerId = peerId;
    audio.srcObject = stream;
    peerAudioEls.set(peerId, audio);
    guestVoicePeers?.appendChild(audio);
    renderPeerList();
  },
  onPeersChanged: (peers) => {
    peersCache = peers;
    renderPeerList();
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

renderPeerList();
renderMuteButton(false, false);

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

joinStreamBtn?.addEventListener('click', async () => {
  try {
    await publisher.connectStream(guestNameInput?.value || 'Invité');
  } catch (error) {
    console.error(error);
    guestStatus.textContent = `Erreur connexion flux: ${error.message}`;
  }
});

joinVoiceBtn?.addEventListener('click', async () => {
  try {
    await publisher.connectVoiceGroup(guestNameInput?.value || 'Invité');
  } catch (error) {
    console.error(error);
    guestStatus.textContent = `Erreur connexion vocal: ${error.message}`;
  }
});

leaveGuestBtn?.addEventListener('click', async () => {
  await publisher.leave();
});

muteMicrophoneBtn?.addEventListener('click', async () => {
  try {
    const isMuted = await publisher.toggleMuted();
    guestStatus.textContent = isMuted ? 'Micro coupé localement.' : 'Micro réactivé.';
  } catch (error) {
    console.error(error);
    guestStatus.textContent = `Erreur mute: ${error.message}`;
  }
});

window.addEventListener('beforeunload', () => {
  publisher.leave();
});
