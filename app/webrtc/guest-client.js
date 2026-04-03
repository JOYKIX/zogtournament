import { WEBRTC_CONFIGURATION } from './constants.js';
import {
  camSignalAnswerRef,
  camCandidatesRef,
  clearSignals,
  listenValue,
  patchGuest,
  pushCandidate,
  removeGuest,
  writeGuest,
  writeSignalOffer,
} from './signaling.js';

function createId() {
  return `guest-${Math.random().toString(36).slice(2, 10)}`;
}

export class GuestCamPublisher {
  constructor({ onState, onLog, onLocalStream }) {
    this.onState = onState;
    this.onLog = onLog;
    this.onLocalStream = onLocalStream;
    this.guestId = null;
    this.name = '';
    this.localStream = null;
    this.connections = new Map();
    this.unsubscribers = [];
  }

  async enableCamera() {
    this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    this.onLocalStream?.(this.localStream);
    this.onState?.('camera-ready');
  }

  async join(name) {
    if (!this.localStream) {
      throw new Error('Active la caméra et le microphone avant de rejoindre.');
    }
    this.guestId = createId();
    this.name = String(name || 'Invité').trim() || 'Invité';

    await writeGuest(this.guestId, {
      name: this.name,
      status: 'connecting',
      cameraEnabled: true,
      microphoneEnabled: true,
      joinedAt: Date.now(),
      updatedAt: Date.now(),
    });

    await this.startRoleConnection('admin');
    await this.startRoleConnection('overlay');

    await patchGuest(this.guestId, { status: 'connected', updatedAt: Date.now() });
    this.onState?.('connected');
  }

  async startRoleConnection(role) {
    const connection = new RTCPeerConnection(WEBRTC_CONFIGURATION);
    this.localStream.getTracks().forEach((track) => connection.addTrack(track, this.localStream));

    connection.onconnectionstatechange = async () => {
      this.onLog?.(`[guest/${role}] ${connection.connectionState}`);
      if (['failed', 'disconnected', 'closed'].includes(connection.connectionState) && this.guestId) {
        await patchGuest(this.guestId, { status: 'disconnected', updatedAt: Date.now() });
      }
    };

    connection.onicecandidate = async (event) => {
      if (!event.candidate || !this.guestId) {
        return;
      }
      await pushCandidate(role, 'guest', this.guestId, event.candidate.toJSON());
    };

    const unsubscribeAnswer = listenValue(camSignalAnswerRef(role, this.guestId), async (snapshot) => {
      const answer = snapshot.val();
      if (!answer?.sdp || connection.currentRemoteDescription) {
        return;
      }
      await connection.setRemoteDescription(new RTCSessionDescription(answer));
    });

    const unsubscribeCandidates = listenValue(camCandidatesRef(role, role, this.guestId), async (snapshot) => {
      const candidates = snapshot.val() || {};
      for (const candidate of Object.values(candidates)) {
        try {
          await connection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          this.onLog?.(`[guest/${role}] ICE invalide: ${error.message}`);
        }
      }
    });

    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    await writeSignalOffer(role, this.guestId, {
      type: offer.type,
      sdp: offer.sdp,
      updatedAt: Date.now(),
    });

    this.connections.set(role, { connection, unsubscribeAnswer, unsubscribeCandidates });
  }

  async leave() {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe?.());
    this.unsubscribers = [];

    for (const { connection, unsubscribeAnswer, unsubscribeCandidates } of this.connections.values()) {
      unsubscribeAnswer?.();
      unsubscribeCandidates?.();
      connection.close();
    }
    this.connections.clear();

    if (this.guestId) {
      await clearSignals('admin', this.guestId);
      await clearSignals('overlay', this.guestId);
      await removeGuest(this.guestId);
    }

    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
    this.guestId = null;
    this.onState?.('idle');
    this.onLocalStream?.(null);
  }
}
